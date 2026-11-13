"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import { isDueDateOf } from "@/features/schedule/periods";

export type CardActionState = { error?: string } | null;

// Vencimiento de una tarjeta propia, validado contra su regla.
async function findCardDue(userId: string, scheduledPaymentId: string, dueDateValue: string) {
  const dueDate = parseDateOnly(dueDateValue);
  if (!dueDate) return null;
  const payment = await prisma.scheduledPayment.findFirst({
    where: { id: scheduledPaymentId, userId, type: "CREDIT_CARD" },
  });
  if (!payment || !(await isDueDateOf(payment, dueDate))) return null;
  return { payment, dueDate };
}

// Deuda del estado de cuenta de un vencimiento. Vacío = se borra y el calendario
// vuelve al estimado.
export async function saveCardStatement(
  scheduledPaymentId: string,
  dueDateValue: string,
  _prevState: CardActionState,
  formData: FormData
): Promise<CardActionState> {
  const userId = await requireUserId();

  const due = await findCardDue(userId, scheduledPaymentId, dueDateValue);
  if (!due) return { error: "Vencimiento inválido." };

  const raw = String(formData.get("amount") ?? "").trim();
  const where = { scheduledPaymentId_dueDate: { scheduledPaymentId: due.payment.id, dueDate: due.dueDate } };

  if (!raw) {
    await prisma.cardStatement.deleteMany({ where: { scheduledPaymentId: due.payment.id, dueDate: due.dueDate } });
  } else {
    const value = Number(raw);
    const amount = Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
    if (!amount) return { error: "La deuda debe ser mayor a 0." };
    await prisma.cardStatement.upsert({
      where,
      create: { scheduledPaymentId: due.payment.id, dueDate: due.dueDate, amount },
      update: { amount },
    });
  }

  // "layout" incluye la página de detalle de cada vencimiento.
  revalidatePath("/dashboard/calendario", "layout");
  revalidatePath("/dashboard/tarjetas", "layout");
  return null;
}

// Los consumos de una tarjeta se ven en Tarjetas, Calendario (estimado),
// Transacciones y el selector de tarjeta del layout: se revalida todo el dashboard.
function revalidateCards() {
  revalidatePath("/dashboard", "layout");
}

async function findOwnCard(userId: string, cardId: string) {
  return prisma.scheduledPayment.findFirst({
    where: { id: cardId, userId, type: "CREDIT_CARD" },
    select: { id: true },
  });
}

// Pasa gastos ya registrados a consumos de la tarjeta: método tarjeta de crédito,
// esta tarjeta y sin cuenta. Los que salían de una cuenta dejan de restar de ella:
// se pagan al pagar la tarjeta.
export async function linkCardTransactions(
  cardId: string,
  _prevState: CardActionState,
  formData: FormData
): Promise<CardActionState> {
  const userId = await requireUserId();

  const card = await findOwnCard(userId, cardId);
  if (!card) return { error: "Tarjeta inválida." };

  const ids = [...new Set(formData.getAll("transactionId").map(String).filter(Boolean))];
  if (ids.length === 0) return { error: "Elegí al menos un gasto." };

  const owned = await prisma.transaction.count({ where: { id: { in: ids }, userId, kind: "EXPENSE" } });
  if (owned !== ids.length) return { error: "Hay gastos que no se pueden vincular. Recargá la página." };

  await prisma.transaction.updateMany({
    where: { id: { in: ids }, userId, kind: "EXPENSE" },
    data: { paymentMethod: "CREDIT_CARD", cardId: card.id, accountId: null },
  });

  revalidateCards();
  return null;
}

// Borra la tarjeta con su cronograma, deuda. Los pagos ya hechos se
// conservan en su cuenta. No se borra si tiene consumos: quedarían sin cuenta
// ni tarjeta (la página no ofrece borrarla en ese caso).
export async function deleteCard(cardId: string) {
  const userId = await requireUserId();
  const card = await findOwnCard(userId, cardId);
  const charges = card ? await prisma.transaction.count({ where: { cardId: card.id, accountId: null } }) : 0;
  if (card && charges === 0) await prisma.scheduledPayment.delete({ where: { id: card.id } });
  revalidateCards();
  redirect("/dashboard/tarjetas");
}
