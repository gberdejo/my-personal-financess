"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import { isPaymentMethod } from "@/lib/labels";
import { parseReceiptUrls, receiptUrlsError } from "@/lib/receipts";
import { saveCategoryReason } from "@/features/categories/reasons";
import { amountLock } from "@/lib/transaction-lock";
import { loadUserCards, readChargeCard, readExpenseSource } from "@/features/cards/lookup";
import type { PaymentMethod, TransactionKind } from "@/generated/prisma/client";

export type ActionState = { error?: string } | null;

function revalidateAll() {
  revalidatePath("/dashboard/transacciones");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cuentas");
  // Un gasto con tarjeta cambia el estimado del calendario, y borrar el gasto
  // de una cuota pagada la devuelve a pendiente.
  revalidatePath("/dashboard/calendario", "layout");
  revalidatePath("/dashboard/tarjetas", "layout");
  revalidatePath("/dashboard/prestamos", "layout");
  // Borrar un gasto aplicado desde un presupuesto devuelve su línea a pendiente.
  revalidatePath("/dashboard/presupuestos", "layout");
  // Borrar una transacción importada devuelve su movimiento a pendiente.
  revalidatePath("/dashboard/importaciones", "layout");
}

function readPaymentMethod(formData: FormData): PaymentMethod | null {
  const raw = String(formData.get("paymentMethod") ?? "");
  return isPaymentMethod(raw) ? raw : null;
}

// Motivo (con sugerencias) y descripción (nota libre) son opcionales.
function readText(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim() || null;
}

// Links a comprobantes (uno por línea). `error` si alguno no es un link válido.
function readReceiptUrls(formData: FormData): { urls: string[] } | { error: string } {
  const parsed = parseReceiptUrls(String(formData.get("receiptUrls") ?? ""));
  const error = receiptUrlsError(parsed);
  return error ? { error } : { urls: parsed.urls };
}

// Reutilizar el motivo ayuda a que los gastos recurrentes coincidan. Si ya
// existía, no pasa nada: el movimiento ya quedó guardado.
async function maybeSaveReason(userId: string, categoryId: string, reason: string | null, formData: FormData) {
  if (!reason || formData.get("saveReason") !== "on") return;
  await saveCategoryReason(userId, categoryId, reason);
  revalidatePath("/dashboard/categorias");
}

export async function createTransaction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();

  const kind = String(formData.get("kind") ?? "") as TransactionKind;
  const categoryId = String(formData.get("categoryId") ?? "");
  const amount = Number(formData.get("amount"));
  const reason = readText(formData, "reason");
  const description = readText(formData, "description");
  const dateRaw = String(formData.get("date") ?? "");
  // Los ingresos no llevan método de pago.
  const paymentMethod = kind === "EXPENSE" ? readPaymentMethod(formData) : null;

  if (kind !== "INCOME" && kind !== "EXPENSE") return { error: "Tipo de movimiento inválido." };
  if (!categoryId) return { error: "Elegí una categoría." };
  if (!amount || amount <= 0) return { error: "El monto debe ser mayor a 0." };
  if (kind === "EXPENSE" && !paymentMethod) return { error: "Elegí un método de pago." };
  if (!dateRaw) return { error: "La fecha es obligatoria." };

  const date = parseDateOnly(dateRaw);
  if (!date) return { error: "La fecha no es válida." };
  const receipts = readReceiptUrls(formData);
  if ("error" in receipts) return { error: receipts.error };
  // Un gasto con tarjeta de crédito es un consumo: sin cuenta hasta que se paga la tarjeta.
  const source = await readExpenseSource(userId, paymentMethod, formData);
  if ("error" in source) return { error: source.error };

  const category = await prisma.category.findFirst({
    where: { id: categoryId, kind, OR: [{ userId: null }, { userId }] },
  });
  if (!category) return { error: "Categoría inválida." };

  await prisma.transaction.create({
    data: {
      userId,
      accountId: source.accountId,
      cardId: source.cardId,
      categoryId,
      kind,
      amount,
      reason,
      description,
      date,
      paymentMethod,
      receiptUrls: receipts.urls,
    },
  });

  await maybeSaveReason(userId, categoryId, reason, formData);

  revalidateAll();
  return null;
}

// De dónde sale un gasto que se edita:
// - un consumo (sin cuenta) que sigue con tarjeta puede cambiar de tarjeta;
// - un consumo que pasa a otro método sale de la cuenta elegida;
// - un gasto con cuenta pasa a consumo solo con tarjeta y "Pasar a consumo" (`asCharge`);
// - si no, conserva su cuenta (los gastos con tarjeta anteriores quedan ya descontados).
async function readUpdatedSource(
  userId: string,
  transaction: { accountId: string | null; cardId: string | null },
  paymentMethod: PaymentMethod | null,
  formData: FormData
): Promise<{ accountId: string | null; cardId: string | null } | { error: string }> {
  const isCharge = transaction.accountId === null;
  if (paymentMethod === "CREDIT_CARD" && (isCharge || formData.get("asCharge") === "on")) {
    const card = await readChargeCard(userId, formData);
    return "error" in card ? card : { accountId: null, cardId: card.cardId };
  }
  if (isCharge) return readExpenseSource(userId, paymentMethod, formData);
  if (paymentMethod !== "CREDIT_CARD") return { accountId: transaction.accountId, cardId: null };
  // Gasto anterior con tarjeta que sigue descontado de su cuenta: la tarjeta es solo informativa.
  const raw = String(formData.get("cardId") ?? "").trim();
  const cards = raw ? await loadUserCards(userId) : [];
  return { accountId: transaction.accountId, cardId: cards.some((c) => c.id === raw) ? raw : transaction.cardId };
}

export async function updateTransaction(
  transactionId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const dateRaw = String(formData.get("date") ?? "");
  if (!dateRaw) return { error: "La fecha es obligatoria." };

  const date = parseDateOnly(dateRaw);
  if (!date) return { error: "La fecha no es válida." };

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    select: {
      kind: true,
      amount: true,
      accountId: true,
      cardId: true,
      loanPrepayment: { select: { id: true } },
    },
  });
  if (!transaction) return { error: "No se pudo actualizar el movimiento." };
  if (transaction.kind === "CARD_PAYMENT") {
    return { error: "Un pago de tarjeta se deshace desde su periodo en Tarjetas." };
  }

  // Gastos con monto fijo (ver `amountLock`): se conserva el que tienen aunque
  // llegue otro en el formulario.
  const amount = amountLock(transaction)
    ? Number(transaction.amount)
    : Math.round(Number(formData.get("amount")) * 100) / 100;
  if (!amount || amount <= 0) return { error: "El monto debe ser mayor a 0." };

  // La categoría puede cambiar, pero solo a otra del mismo tipo (gasto o ingreso).
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!categoryId) return { error: "Elegí una categoría." };
  const category = await prisma.category.findFirst({
    where: { id: categoryId, kind: transaction.kind, OR: [{ userId: null }, { userId }] },
    select: { id: true },
  });
  if (!category) return { error: "Categoría inválida." };

  const paymentMethod = transaction.kind === "EXPENSE" ? readPaymentMethod(formData) : null;
  if (transaction.kind === "EXPENSE" && !paymentMethod) return { error: "Elegí un método de pago." };
  const source = transaction.kind === "EXPENSE"
    ? await readUpdatedSource(userId, transaction, paymentMethod, formData)
    : { accountId: transaction.accountId, cardId: null };
  if ("error" in source) return { error: source.error };

  const reason = readText(formData, "reason");
  const description = readText(formData, "description");
  const receipts = readReceiptUrls(formData);
  if ("error" in receipts) return { error: receipts.error };

  // Si es el pago de una cuota, el monto pagado de la cuota se mantiene igual al del gasto.
  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: transactionId },
      data: {
        date,
        amount,
        categoryId,
        paymentMethod,
        accountId: source.accountId,
        cardId: source.cardId,
        reason,
        description,
        receiptUrls: receipts.urls,
      },
    }),
    prisma.scheduledOccurrence.updateMany({ where: { transactionId }, data: { amount } }),
  ]);

  await maybeSaveReason(userId, categoryId, reason, formData);

  revalidateAll();
  return null;
}

export async function deleteTransaction(transactionId: string) {
  const userId = await requireUserId();
  await prisma.transaction.deleteMany({ where: { id: transactionId, userId } });
  revalidateAll();
}
