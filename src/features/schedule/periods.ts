import { prisma } from "@/lib/prisma";
import { shiftDay } from "@/lib/date";
import {
  cardOccurrences,
  isPaymentDueDate,
  monthIndex,
  monthStart,
  type BillingPeriod,
  type CardRule,
  type PaymentDateSources,
  type PaymentRule,
} from "@/lib/schedule";
import type { Prisma, ScheduledPaymentType } from "@/generated/prisma/client";

// Un vencimiento necesita el cierre de su mes y el del anterior (hasta ~3 meses
// antes del pago) y puede caer hasta ~2 meses después del cierre.
const PERIODS_BEFORE_DAYS = 100;
const PERIODS_AFTER_DAYS = 62;

// Cronograma de cada tarjeta, solo los meses que afectan vencimientos en [start, end).
export async function loadBillingPeriods(paymentIds: string[], start: Date, end: Date) {
  const byPayment = new Map<string, BillingPeriod[]>();
  if (paymentIds.length === 0) return byPayment;

  const periods = await prisma.cardBillingPeriod.findMany({
    where: {
      scheduledPaymentId: { in: paymentIds },
      closingDate: { gte: shiftDay(start, -PERIODS_BEFORE_DAYS), lt: shiftDay(end, PERIODS_AFTER_DAYS) },
    },
    select: { scheduledPaymentId: true, closingDate: true, dueDate: true },
  });
  for (const period of periods) {
    const list = byPayment.get(period.scheduledPaymentId) ?? [];
    list.push({ closingDate: period.closingDate, dueDate: period.dueDate });
    byPayment.set(period.scheduledPaymentId, list);
  }
  return byPayment;
}

// Fechas guardadas de cada pago que afectan vencimientos en [start, end): el
// cronograma de las tarjetas y las cuotas de los préstamos.
export async function loadDateSources(payments: { id: string; type: ScheduledPaymentType }[], start: Date, end: Date) {
  const cardIds = payments.filter((p) => p.type === "CREDIT_CARD").map((p) => p.id);
  const loanIds = payments.filter((p) => p.type === "LOAN").map((p) => p.id);

  const [periods, installments] = await Promise.all([
    loadBillingPeriods(cardIds, start, end),
    loanIds.length
      ? prisma.loanInstallment.findMany({
          where: { scheduledPaymentId: { in: loanIds }, dueDate: { gte: start, lt: end } },
          select: { scheduledPaymentId: true, dueDate: true },
        })
      : [],
  ]);

  const installmentDates = new Map<string, Date[]>();
  for (const installment of installments) {
    const list = installmentDates.get(installment.scheduledPaymentId) ?? [];
    list.push(installment.dueDate);
    installmentDates.set(installment.scheduledPaymentId, list);
  }

  return (paymentId: string): PaymentDateSources => ({
    periods: periods.get(paymentId) ?? [],
    installmentDates: installmentDates.get(paymentId) ?? [],
  });
}

// ¿`date` es un vencimiento de este pago? (tarjetas según su cronograma,
// préstamos según sus cuotas)
export async function isDueDateOf(payment: PaymentRule & { id: string }, date: Date) {
  const sources = await loadDateSources([payment], date, shiftDay(date, 1));
  return isPaymentDueDate(payment, sources(payment.id), date);
}

// Todo lo que cuelga de un vencimiento (cuota resuelta, deuda, ruleteos) se
// identifica por su fecha de pago: si la fecha cambia, se mueve con ella.
export async function moveDueDate(
  tx: Prisma.TransactionClient,
  scheduledPaymentId: string,
  from: Date,
  to: Date
) {
  if (from.getTime() === to.getTime()) return;
  const where = { scheduledPaymentId, dueDate: from };
  const data = { dueDate: to };
  await tx.scheduledOccurrence.updateMany({ where, data });
  await tx.cardStatement.updateMany({ where, data });
  await tx.rouletteOperation.updateMany({ where, data });
}

// Antes de cambiar la regla de una tarjeta, pasa al cronograma los meses de la
// regla que ya tienen datos (pagados, con deuda o ruleteo), para que no cambien
// de fecha y queden huérfanos.
export async function freezeRuleMonthsWithData(tx: Prisma.TransactionClient, scheduledPaymentId: string, rule: CardRule) {
  const where = { scheduledPaymentId };
  const select = { dueDate: true } as const;
  const [occurrences, statements, operations, periods] = await Promise.all([
    tx.scheduledOccurrence.findMany({ where, select }),
    tx.cardStatement.findMany({ where, select }),
    tx.rouletteOperation.findMany({ where, select, distinct: ["dueDate"] }),
    tx.cardBillingPeriod.findMany({ where, select: { closingDate: true, dueDate: true } }),
  ]);

  const scheduled = new Set(periods.map((p) => p.dueDate.getTime()));
  const dueDates = new Map<number, Date>();
  for (const { dueDate } of [...occurrences, ...statements, ...operations]) {
    if (!scheduled.has(dueDate.getTime())) dueDates.set(dueDate.getTime(), dueDate);
  }

  for (const dueDate of dueDates.values()) {
    const [occurrence] = cardOccurrences(rule, periods, dueDate, shiftDay(dueDate, 1));
    if (!occurrence || occurrence.fromSchedule) continue;
    await tx.cardBillingPeriod.create({
      data: {
        scheduledPaymentId,
        month: monthStart(monthIndex(occurrence.closingDate)),
        closingDate: occurrence.closingDate,
        dueDate: occurrence.dueDate,
      },
    });
  }
}
