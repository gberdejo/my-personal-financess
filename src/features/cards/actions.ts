"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

export type CardActionState = { error?: string } | null;

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

// Borra la tarjeta con su cronograma, deuda y ruleteos. Los pagos ya hechos se
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
