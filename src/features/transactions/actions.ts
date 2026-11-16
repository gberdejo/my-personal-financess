"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseDateOnly, toUTCDateInputValue } from "@/lib/date";
import { readExchangeRate, toSoles } from "@/lib/currency";
import { formatRate, formatUsd, roundMoney } from "@/lib/format";
import { isPaymentMethod } from "@/lib/labels";
import { parseReceiptUrls, receiptUrlsError } from "@/lib/receipts";
import { saveCategoryReason } from "@/features/categories/reasons";
import { amountLock } from "@/lib/transaction-lock";
import { latestExchangeRate, loadUserCards, readChargeCard, readExpenseSource } from "@/features/cards/lookup";
import { applyCycleRate } from "@/features/cards/rate";
import { undoCardPart } from "@/features/cards/payments";
import { getCalendarEntry } from "@/features/schedule/queries";
import type { Currency, PaymentMethod, TransactionKind } from "@/generated/prisma/client";

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

// Monto de un movimiento: `amount` siempre en soles. Un consumo en dólares guarda
// además el monto en US$ y, si ya se pagó, el tipo de cambio del pago.
type Money = { amount: number; currency: Currency; foreignAmount: number | null; exchangeRate: number | null };

// Tipo de cambio para estimar en soles un consumo en dólares todavía sin pagar:
// el del último pago en dólares o, si nunca hubo, el "TC referencial" del formulario.
async function readReferenceRate(userId: string, formData: FormData): Promise<{ rate: number } | { error: string }> {
  const last = await latestExchangeRate(userId);
  if (last !== null) return { rate: last };
  const reference = readExchangeRate(formData, "referenceRate");
  if ("error" in reference) return reference;
  if (reference.rate === null) return { error: "Ingresá un tipo de cambio referencial para estimar el monto en soles." };
  return { rate: reference.rate };
}

export async function createTransaction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();

  const kind = String(formData.get("kind") ?? "") as TransactionKind;
  const categoryId = String(formData.get("categoryId") ?? "");
  const amount = Number(formData.get("amount"));
  const wantsUsd = formData.get("currency") === "USD";
  const reason = readText(formData, "reason");
  const description = readText(formData, "description");
  const dateRaw = String(formData.get("date") ?? "");
  // Los ingresos no llevan método de pago.
  const paymentMethod = kind === "EXPENSE" ? readPaymentMethod(formData) : null;

  if (kind !== "INCOME" && kind !== "EXPENSE") return { error: "Tipo de movimiento inválido." };
  if (!categoryId) return { error: "Elegí una categoría." };
  if (!amount || amount <= 0) return { error: "El monto debe ser mayor a 0." };
  if (kind === "EXPENSE" && !paymentMethod) return { error: "Elegí un método de pago." };
  if (wantsUsd && paymentMethod !== "CREDIT_CARD") return { error: "Solo los consumos con tarjeta pueden ser en dólares." };
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

  let money: Money = { amount, currency: "PEN", foreignAmount: null, exchangeRate: null };
  if (wantsUsd) {
    const reference = await readReferenceRate(userId, formData);
    if ("error" in reference) return { error: reference.error };
    const usd = roundMoney(amount);
    money = { amount: toSoles(usd, reference.rate), currency: "USD", foreignAmount: usd, exchangeRate: null };
  }

  await prisma.transaction.create({
    data: {
      userId,
      accountId: source.accountId,
      cardId: source.cardId,
      categoryId,
      kind,
      ...money,
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
      currency: true,
      exchangeRate: true,
      accountId: true,
      cardId: true,
      loanPrepayment: { select: { id: true } },
      usdScheduledOccurrence: {
        select: { id: true, scheduledPaymentId: true, dueDate: true, penAmount: true },
      },
    },
  });
  if (!transaction) return { error: "No se pudo actualizar el movimiento." };
  if (transaction.kind === "CARD_PAYMENT") {
    // Solo el pago en dólares de un periodo se edita (monto en US$ y tipo de cambio).
    if (transaction.usdScheduledOccurrence) {
      return updateUsdPayment(transaction.usdScheduledOccurrence, transactionId, date, formData);
    }
    return { error: "Un pago de tarjeta se deshace desde su periodo en Tarjetas." };
  }

  // Gastos con monto fijo (ver `amountLock`): se conserva el que tienen aunque
  // llegue otro en el formulario.
  const locked = amountLock(transaction) !== null;
  // Sin `currency` en el formulario, un consumo en dólares se queda en dólares mientras siga siendo consumo.
  const currencyField = formData.get("currency");
  const explicitUsd = !locked && currencyField === "USD";
  const keepsUsd = !locked && currencyField === null && transaction.currency === "USD";

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

  const isChargeAfter = paymentMethod === "CREDIT_CARD" && source.accountId === null;
  if (explicitUsd && !isChargeAfter) return { error: "Solo los consumos con tarjeta pueden ser en dólares." };

  const wantsUsd = explicitUsd || (keepsUsd && isChargeAfter);
  let money: Money;
  if (wantsUsd) {
    // Un consumo ya pagado conserva su propio tipo de cambio; si no, se estima.
    const own = transaction.currency === "USD" && transaction.exchangeRate !== null ? Number(transaction.exchangeRate) : null;
    const usd = roundMoney(Number(formData.get("amount")));
    if (!usd || usd <= 0) return { error: "El monto debe ser mayor a 0." };
    let rate = own;
    if (rate === null) {
      const reference = await readReferenceRate(userId, formData);
      if ("error" in reference) return { error: reference.error };
      rate = reference.rate;
    }
    money = { amount: toSoles(usd, rate), currency: "USD", foreignAmount: usd, exchangeRate: own };
  } else {
    // Soles: si venía en dólares (dejó de ser consumo o se eligió S/), vale el monto escrito en el formulario.
    const amount = locked ? Number(transaction.amount) : roundMoney(Number(formData.get("amount")));
    if (!amount || amount <= 0) return { error: "El monto debe ser mayor a 0." };
    money = { amount, currency: "PEN", foreignAmount: null, exchangeRate: null };
  }

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
        ...money,
        categoryId,
        paymentMethod,
        accountId: source.accountId,
        cardId: source.cardId,
        reason,
        description,
        receiptUrls: receipts.urls,
      },
    }),
    prisma.scheduledOccurrence.updateMany({ where: { transactionId }, data: { amount: money.amount } }),
  ]);

  await maybeSaveReason(userId, categoryId, reason, formData);

  revalidateAll();
  return null;
}

// Edita el pago en dólares de un periodo de tarjeta: cambia su monto en soles
// (US$ × tipo de cambio), el total del periodo y los consumos en dólares del ciclo.
async function updateUsdPayment(
  occurrence: { id: string; scheduledPaymentId: string; dueDate: Date; penAmount: { toNumber(): number } | null },
  transactionId: string,
  date: Date,
  formData: FormData
): Promise<ActionState> {
  const usd = roundMoney(Number(formData.get("amount")));
  if (!usd || usd <= 0) return { error: "El monto en dólares debe ser mayor a 0." };
  const parsedRate = readExchangeRate(formData);
  if ("error" in parsedRate) return { error: parsedRate.error };
  const rate = parsedRate.rate;
  if (rate === null) return { error: "Ingresá el tipo de cambio." };

  const entry = await getCalendarEntry(occurrence.scheduledPaymentId, toUTCDateInputValue(occurrence.dueDate));
  // La parte en soles se guarda aparte (`penAmount`), aunque solo se haya marcado.
  const solesPart = occurrence.penAmount?.toNumber() ?? 0;
  const amount = toSoles(usd, rate);

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        date,
        amount,
        foreignAmount: usd,
        exchangeRate: rate,
        description: `${formatUsd(usd)} a TC ${formatRate(rate)}`,
      },
    });
    await tx.scheduledOccurrence.update({
      where: { id: occurrence.id },
      data: {
        amount: roundMoney(solesPart + amount),
        amountUsd: usd,
        exchangeRate: rate,
      },
    });
    if (entry?.cycle) await applyCycleRate(tx, occurrence.scheduledPaymentId, entry.cycle, rate);
  });

  revalidateAll();
  // El último tipo de cambio lo carga el layout del dashboard.
  revalidatePath("/dashboard", "layout");
  return null;
}

// Borrar el pago de una tarjeta deshace solo esa parte (soles o dólares): el
// vencimiento queda pagado en parte o pendiente. Los demás gastos se borran sin más.
export async function deleteTransaction(transactionId: string) {
  const userId = await requireUserId();
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    select: {
      kind: true,
      scheduledOccurrence: { select: { scheduledPaymentId: true, dueDate: true } },
      usdScheduledOccurrence: { select: { scheduledPaymentId: true, dueDate: true } },
    },
  });
  const occurrence = transaction?.scheduledOccurrence ?? transaction?.usdScheduledOccurrence;
  if (transaction?.kind === "CARD_PAYMENT" && occurrence) {
    await undoCardPart(
      occurrence.scheduledPaymentId,
      toUTCDateInputValue(occurrence.dueDate),
      transaction.scheduledOccurrence ? "PEN" : "USD"
    );
  } else {
    await prisma.transaction.deleteMany({ where: { id: transactionId, userId } });
  }
  revalidateAll();
  revalidatePath("/dashboard", "layout");
}
