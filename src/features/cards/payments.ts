"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import { readExchangeRate, toSoles } from "@/lib/currency";
import { formatDate, formatRate, formatUsd, roundMoney } from "@/lib/format";
import { cardPaymentCategoryId } from "@/features/cards/lookup";
import { applyCycleRate } from "@/features/cards/rate";
import { isDueDateOf } from "@/features/schedule/periods";
import { getCalendarEntry } from "@/features/schedule/queries";

export type CardPartState = { error?: string } | null;
export type CardPart = "PEN" | "USD";

function readText(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

// Total del vencimiento en soles: soles pagados + dólares convertidos con su tipo de cambio.
function totalSoles(penAmount: number | null, usdAmount: number | null, rate: number | null) {
  return roundMoney((penAmount ?? 0) + (usdAmount && rate ? toSoles(usdAmount, rate) : 0));
}

// Paga (o solo marca) una parte del vencimiento de una tarjeta: la de soles o la de
// dólares, de forma independiente. Con las dos resueltas queda Pagado; con una sola,
// Pagado en parte. Una moneda sin deuda se completa sola.
export async function payCardPart(
  scheduledPaymentId: string,
  dueDateValue: string,
  part: CardPart,
  _prevState: CardPartState,
  formData: FormData
): Promise<CardPartState> {
  const userId = await requireUserId();
  const label = part === "PEN" ? "en soles" : "en dólares";

  const payment = await prisma.scheduledPayment.findFirst({
    where: { id: scheduledPaymentId, userId, type: "CREDIT_CARD" },
  });
  if (!payment) return { error: "Tarjeta inválida." };
  const dueDate = parseDateOnly(dueDateValue);
  if (!dueDate || !(await isDueDateOf(payment, dueDate))) return { error: "Fecha de vencimiento inválida." };

  const existing = await prisma.scheduledOccurrence.findUnique({
    where: { scheduledPaymentId_dueDate: { scheduledPaymentId: payment.id, dueDate } },
  });
  if (existing && existing.status !== "PARTIAL") return { error: "Este vencimiento ya fue resuelto." };
  if (existing && (part === "PEN" ? existing.penSettled : existing.usdSettled)) {
    return { error: "Esta parte ya está pagada." };
  }

  const amount = roundMoney(Number(formData.get("amount") || 0));
  if (!Number.isFinite(amount) || amount <= 0) return { error: `El monto ${label} debe ser mayor a 0.` };
  const markOnly = formData.get("markOnly") === "on";

  let rate: number | null = null;
  if (part === "USD") {
    const parsed = readExchangeRate(formData);
    if ("error" in parsed) return parsed;
    // Obligatorio también al marcar: fija el tipo de cambio de los consumos del ciclo.
    if (parsed.rate === null) return { error: "Ingresá el tipo de cambio para pagar los dólares." };
    rate = parsed.rate;
  }

  // La cuenta y la fecha solo hacen falta si se crea el pago.
  let accountId: string | null = null;
  let date: Date | null = null;
  if (!markOnly) {
    const accountRaw = readText(formData, "accountId");
    const account = accountRaw
      ? await prisma.account.findFirst({ where: { id: accountRaw, userId }, select: { id: true } })
      : null;
    if (!account) return { error: `Elegí la cuenta desde la que pagás la parte ${label}.` };
    accountId = account.id;
    const dateRaw = readText(formData, "date");
    date = dateRaw ? parseDateOnly(dateRaw) : null;
    if (!date) return { error: `La fecha del pago ${label} no es válida.` };
  }

  // Pendiente de la otra moneda: si no hay deuda, esa parte se da por resuelta.
  const entry = await getCalendarEntry(payment.id, dueDateValue);
  if (!entry || !entry.parts) return { error: "Fecha de vencimiento inválida." };
  const other = part === "PEN" ? entry.parts.usd : entry.parts.pen;
  const otherAutoSettles = !other.settled && other.pending < 0.005;
  const cycle = entry.cycle;

  await prisma.$transaction(async (tx) => {
    let transactionId: string | null = null;
    if (!markOnly && accountId && date) {
      const created = await tx.transaction.create({
        data: {
          userId,
          accountId,
          categoryId: await cardPaymentCategoryId(),
          kind: "CARD_PAYMENT",
          date,
          paymentMethod: null,
          ...(part === "PEN"
            ? {
                amount,
                reason: `Pago ${payment.name}`,
                description: cycle ? `Consumos del ${formatDate(cycle.start)} al ${formatDate(cycle.closing)}` : null,
              }
            : {
                amount: toSoles(amount, rate!),
                currency: "USD" as const,
                foreignAmount: amount,
                exchangeRate: rate,
                reason: `Pago ${payment.name} (US$)`,
                description: `${formatUsd(amount)} a TC ${formatRate(rate!)}`,
              }),
        },
      });
      transactionId = created.id;
    }

    // Estado de las dos partes después de este pago.
    const pen =
      part === "PEN"
        ? { settled: true, amount, transactionId }
        : {
            settled: existing?.penSettled || otherAutoSettles,
            amount: existing?.penAmount != null ? Number(existing.penAmount) : otherAutoSettles ? 0 : null,
            transactionId: existing?.transactionId ?? null,
          };
    const usd =
      part === "USD"
        ? { settled: true, amount, rate, transactionId }
        : {
            settled: existing?.usdSettled || otherAutoSettles,
            amount: existing?.amountUsd != null ? Number(existing.amountUsd) : null,
            rate: existing?.exchangeRate != null ? Number(existing.exchangeRate) : null,
            transactionId: existing?.usdTransactionId ?? null,
          };
    const complete = pen.settled && usd.settled;

    const data = {
      status: complete ? ("PAID" as const) : ("PARTIAL" as const),
      amount: totalSoles(pen.amount, usd.amount, usd.rate),
      penSettled: pen.settled,
      usdSettled: usd.settled,
      penAmount: pen.amount,
      transactionId: pen.transactionId,
      amountUsd: usd.amount,
      exchangeRate: usd.rate,
      usdTransactionId: usd.transactionId,
      // Al quedar pagada se guarda cuánto sumaban los consumos, para avisar si cambian.
      ...(complete ? { estimatedAtPayment: entry.estimated, estimatedUsdAtPayment: entry.estimatedUsd } : {}),
    };
    await tx.scheduledOccurrence.upsert({
      where: { scheduledPaymentId_dueDate: { scheduledPaymentId: payment.id, dueDate } },
      create: { scheduledPaymentId: payment.id, dueDate, ...data },
      update: data,
    });
    if (part === "USD" && rate && cycle) await applyCycleRate(tx, payment.id, cycle, rate);
  });

  revalidateAllCardViews();
  return null;
}

// Deshace una parte (soles o dólares): borra su transacción, si existe, y la deja
// pendiente. Si la otra parte solo estaba resuelta por no tener deuda, también se
// limpia. Sin ninguna parte resuelta, el vencimiento vuelve a pendiente.
export async function undoCardPart(scheduledPaymentId: string, dueDateValue: string, part: CardPart) {
  const userId = await requireUserId();
  const dueDate = parseDateOnly(dueDateValue);
  if (!dueDate) return;

  const occurrence = await prisma.scheduledOccurrence.findFirst({
    where: { scheduledPaymentId, dueDate, scheduledPayment: { userId, type: "CREDIT_CARD" } },
  });
  if (!occurrence) return;
  const entry = occurrence.exchangeRate != null ? await getCalendarEntry(scheduledPaymentId, dueDateValue) : null;

  const pen = {
    settled: occurrence.penSettled,
    amount: occurrence.penAmount != null ? Number(occurrence.penAmount) : null,
    transactionId: occurrence.transactionId,
  };
  const usd = {
    settled: occurrence.usdSettled,
    amount: occurrence.amountUsd != null ? Number(occurrence.amountUsd) : null,
    rate: occurrence.exchangeRate != null ? Number(occurrence.exchangeRate) : null,
    transactionId: occurrence.usdTransactionId,
  };
  const deleteIds = [part === "PEN" ? pen.transactionId : usd.transactionId].filter((id): id is string => id !== null);

  const clearPen = () => Object.assign(pen, { settled: false, amount: null, transactionId: null });
  const clearUsd = () => Object.assign(usd, { settled: false, amount: null, rate: null, transactionId: null });
  if (part === "PEN") {
    clearPen();
    if (usd.settled && !usd.transactionId && (usd.amount ?? 0) === 0) clearUsd();
  } else {
    clearUsd();
    if (pen.settled && !pen.transactionId && (pen.amount ?? 0) === 0) clearPen();
  }

  await prisma.$transaction(async (tx) => {
    // El vencimiento se actualiza antes de borrar la transacción: borrarla primero
    // arrastraría el vencimiento completo (onDelete: Cascade).
    if (!pen.settled && !usd.settled) {
      await tx.scheduledOccurrence.delete({ where: { id: occurrence.id } });
    } else {
      await tx.scheduledOccurrence.update({
        where: { id: occurrence.id },
        data: {
          status: "PARTIAL",
          amount: totalSoles(pen.amount, usd.amount, usd.rate),
          penSettled: pen.settled,
          usdSettled: usd.settled,
          penAmount: pen.amount,
          transactionId: pen.transactionId,
          amountUsd: usd.amount,
          exchangeRate: usd.rate,
          usdTransactionId: usd.transactionId,
          estimatedAtPayment: null,
          estimatedUsdAtPayment: null,
        },
      });
    }
    if (deleteIds.length) await tx.transaction.deleteMany({ where: { id: { in: deleteIds }, userId } });
    // Sin pago en dólares, sus consumos vuelven a ser un estimado en soles.
    if (part === "USD" && entry?.cycle) {
      await tx.transaction.updateMany({
        where: {
          userId,
          cardId: scheduledPaymentId,
          kind: "EXPENSE",
          accountId: null,
          currency: "USD",
          date: { gte: entry.cycle.start, lt: entry.cycle.end },
        },
        data: { exchangeRate: null },
      });
    }
  });

  revalidateAllCardViews();
}

// Pagar o deshacer una parte cambia saldos, transacciones, calendario y el último
// tipo de cambio (que carga el layout del dashboard).
function revalidateAllCardViews() {
  revalidatePath("/dashboard", "layout");
}
