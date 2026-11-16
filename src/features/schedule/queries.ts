import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import {
  monthKey,
  monthRange,
  parseDateOnly,
  shiftDay,
  shiftMonth,
  todayInLima,
  toUTCDateInputValue,
} from "@/lib/date";
import { normalizeReason } from "@/lib/reason";
import { roundMoney } from "@/lib/format";
import {
  billingMonth,
  monthStart,
  nextDayOfMonth,
  nextPaymentOccurrence,
  paymentOccurrences,
  periodsByMonth,
} from "@/lib/schedule";
import { loadDateSources } from "./periods";
import type {
  PaymentMethod,
  ScheduledPaymentType,
  ScheduleFrequency,
} from "@/generated/prisma/client";

// PARTIAL: tarjeta con una sola de sus dos partes (soles o dólares) resuelta.
export type OccurrenceStatusView = "PENDING" | "OVERDUE" | "PARTIAL" | "PAID" | "SKIPPED";

// Una parte (soles o dólares) del vencimiento de una tarjeta.
export type PartView = {
  // Pagada, marcada o sin deuda.
  settled: boolean;
  // Resuelta: lo pagado en su moneda. Si no, el pendiente.
  amount: number;
  // Lo que falta pagar de esta parte (0 si está resuelta).
  pending: number;
  transactionId: string | null;
  // Resuelta sin crear pago (con monto): solo se marcó.
  markOnly: boolean;
  // Si creó pago: fecha y cuenta de salida.
  paidOn: Date | null;
  accountName: string | null;
};

export type LoanInstallmentDetail = {
  number: number;
  count: number;
  principal: number;
  interest: number;
  insurance: number;
  // Saldo de capital después de pagarla.
  balance: number;
};

export type CalendarEntry = {
  key: string;
  scheduledPaymentId: string;
  name: string;
  type: ScheduledPaymentType;
  categoryName: string | null;
  dueDate: Date;
  // "YYYY-MM-DD" del vencimiento, para las acciones.
  dueDateValue: string;
  status: OccurrenceStatusView;
  // Pagado: lo que se pagó (en tarjeta, las dos partes en soles). Pendiente: la
  // deuda ingresada (tarjeta) o el estimado, en soles.
  amount: number;
  // Solo la parte en soles de `amount` (en tarjeta con dólares, sin lo que salió por ellos).
  amountPen: number;
  // En tarjeta, sus consumos en soles del ciclo; si no, el monto de la regla.
  estimated: number;
  // Solo tarjeta: deuda del estado de cuenta ingresada para este vencimiento.
  statementAmount: number | null;
  // Solo tarjeta: consumos en dólares del ciclo y deuda en dólares del estado de cuenta.
  estimatedUsd: number;
  statementAmountUsd: number | null;
  // Solo tarjeta: cada parte por separado. null en servicios y préstamos.
  parts: { pen: PartView; usd: PartView } | null;
  // Solo tarjeta: dólares del vencimiento. Pagado: lo que se pagó, con el tipo de
  // cambio (`exchangeRate`). Pendiente: la deuda en US$ ingresada o el estimado.
  amountUsd: number;
  exchangeRate: number | null;
  // Solo tarjeta pagada: los gastos con tarjeta del ciclo (en soles o en dólares)
  // cambiaron desde que se marcó (`before` al marcarla, `after` ahora). null si no cambiaron.
  cycleChange: { before: number; after: number; beforeUsd: number; afterUsd: number } | null;
  // Solo préstamo: desglose de la cuota del cronograma.
  installment: LoanInstallmentDetail | null;
  transactionId: string | null;
  // Solo tarjeta: el pago en dólares (el de soles es `transactionId`).
  usdTransactionId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
  // Solo tarjeta. `end` es exclusivo; `open` = el ciclo todavía no cerró.
  cycle: { start: Date; end: Date; closing: Date; open: boolean } | null;
};

// Cuánto hacia atrás se buscan cuotas vencidas sin pagar.
const OVERDUE_LOOKBACK_DAYS = 90;
const UPCOMING_DAYS = 7;
// Hasta dónde se busca el próximo vencimiento (alcanza para un pago anual).
const NEXT_LOOKAHEAD_DAYS = 400;

const PAYMENT_INCLUDE = { category: { select: { name: true } } } as const;

async function loadActivePayments(userId: string) {
  return prisma.scheduledPayment.findMany({
    where: { userId, active: true },
    include: PAYMENT_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}

type LoadedPayment = Awaited<ReturnType<typeof loadActivePayments>>[number];

// Solo para el feed del calendario, que ya resolvió el `userId` por token.
// No usar desde páginas: no pide sesión.
export async function getEntriesForUser(userId: string, start: Date, end: Date) {
  const payments = await loadActivePayments(userId);
  return buildEntries(userId, payments, start, end);
}

function entryKey(scheduledPaymentId: string, dueDate: Date) {
  return `${scheduledPaymentId}:${dueDate.getTime()}`;
}

// Cruza las fechas de cada regla en [start, end) con las cuotas ya resueltas y,
// para tarjetas, suma los gastos con tarjeta de cada ciclo y agrega la deuda
// ingresada.
async function buildEntries(userId: string, payments: LoadedPayment[], start: Date, end: Date) {
  const today = todayInLima();

  const sources = await loadDateSources(payments, start, end);
  const dated = payments.flatMap((payment) =>
    paymentOccurrences(payment, sources(payment.id), start, end).map(({ dueDate, cycle }) => ({
      payment,
      dueDate,
      cycle,
    }))
  );
  if (dated.length === 0) return [];

  const inRange = {
    scheduledPaymentId: { in: [...new Set(dated.map((d) => d.payment.id))] },
    dueDate: { gte: start, lt: end },
  };
  const loanIds = [...new Set(dated.filter((d) => d.payment.type === "LOAN").map((d) => d.payment.id))];
  const [stored, statements, installments, installmentCounts] = await Promise.all([
    prisma.scheduledOccurrence.findMany({
      where: inRange,
      include: {
        transaction: { select: { date: true, account: { select: { name: true } } } },
        usdTransaction: { select: { date: true, account: { select: { name: true } } } },
      },
    }),
    prisma.cardStatement.findMany({ where: inRange }),
    loanIds.length
      ? prisma.loanInstallment.findMany({ where: { ...inRange, scheduledPaymentId: { in: loanIds } } })
      : [],
    loanIds.length
      ? prisma.loanInstallment.groupBy({
          by: ["scheduledPaymentId"],
          // "Cuota 5/18": sin contar la cuota 0 del periodo de gracia.
          where: { scheduledPaymentId: { in: loanIds }, number: { gt: 0 } },
          _count: { _all: true },
        })
      : [],
  ]);
  const countByLoan = new Map(installmentCounts.map((c) => [c.scheduledPaymentId, c._count._all]));
  const installmentByKey = new Map(
    installments.map((i): [string, LoanInstallmentDetail & { total: number }] => [
      entryKey(i.scheduledPaymentId, i.dueDate),
      {
        number: i.number,
        count: countByLoan.get(i.scheduledPaymentId) ?? i.number,
        principal: Number(i.principal),
        interest: Number(i.interest),
        insurance: Number(i.lifeInsurance) + Number(i.otherCharges),
        balance: Number(i.balance),
        total: Number(i.total),
      },
    ])
  );
  const storedByKey = new Map(stored.map((o) => [entryKey(o.scheduledPaymentId, o.dueDate), o]));
  const statementByKey = new Map(statements.map((s) => [entryKey(s.scheduledPaymentId, s.dueDate), s]));

  const cycles = dated.flatMap((d) => (d.cycle ? [d.cycle] : []));
  const cardExpenses = cycles.length
    ? await prisma.transaction.findMany({
        where: {
          userId,
          kind: "EXPENSE",
          paymentMethod: "CREDIT_CARD",
          // Solo consumos: los gastos con tarjeta que tienen cuenta ya se descontaron.
          accountId: null,
          cardId: { not: null },
          date: {
            gte: new Date(Math.min(...cycles.map((c) => c.start.getTime()))),
            lt: new Date(Math.max(...cycles.map((c) => c.end.getTime()))),
          },
        },
        select: { date: true, amount: true, currency: true, foreignAmount: true, cardId: true },
      })
    : [];

  return dated
    .map(({ payment, dueDate, cycle }): CalendarEntry => {
      const key = entryKey(payment.id, dueDate);
      const occurrence = storedByKey.get(key);
      const statement = statementByKey.get(key);
      const statementAmount = statement ? Number(statement.amount) : null;
      const statementAmountUsd = statement?.amountUsd != null ? Number(statement.amountUsd) : null;
      const loanInstallment = installmentByKey.get(key) ?? null;
      const inCycle = cycle ? cardExpenses.filter((t) => t.date >= cycle.start && t.date < cycle.end) : [];
      const ofCard = inCycle.filter((t) => t.cardId === payment.id);
      // Los consumos en dólares se suman aparte, en US$: en soles son solo un estimado.
      const estimated = cycle
        ? roundMoney(ofCard.filter((t) => t.currency === "PEN").reduce((sum, t) => sum + Number(t.amount), 0))
        : (loanInstallment?.total ?? Number(payment.amount ?? 0));
      const estimatedUsd = cycle
        ? roundMoney(ofCard.filter((t) => t.currency === "USD").reduce((sum, t) => sum + Number(t.foreignAmount ?? 0), 0))
        : 0;
      const before = occurrence?.status === "PAID" && cycle ? occurrence.estimatedAtPayment : null;
      const beforeUsd = Number(occurrence?.estimatedUsdAtPayment ?? 0);
      const cycleChange =
        before != null && (Math.abs(Number(before) - estimated) >= 0.005 || Math.abs(beforeUsd - estimatedUsd) >= 0.005)
          ? { before: Number(before), after: estimated, beforeUsd, afterUsd: estimatedUsd }
          : null;
      const exchangeRate = occurrence?.exchangeRate != null ? Number(occurrence.exchangeRate) : null;

      // Tarjeta: cada moneda tiene su estado, monto y pendiente.
      let parts: CalendarEntry["parts"] = null;
      let amount: number;
      let amountPen: number;
      let amountUsd: number;
      if (payment.type === "CREDIT_CARD") {
        const pendingPen = statementAmount ?? estimated;
        const pendingUsd = statementAmountUsd ?? estimatedUsd;
        const penSettled = occurrence?.penSettled ?? false;
        const usdSettled = occurrence?.usdSettled ?? false;
        const penPaid = Number(occurrence?.penAmount ?? 0);
        const usdPaid = Number(occurrence?.amountUsd ?? 0);
        parts = {
          pen: {
            settled: penSettled,
            amount: penSettled ? penPaid : pendingPen,
            pending: penSettled ? 0 : pendingPen,
            transactionId: occurrence?.transactionId ?? null,
            markOnly: penSettled && !occurrence?.transactionId && penPaid > 0,
            paidOn: occurrence?.transaction?.date ?? null,
            accountName: occurrence?.transaction?.account?.name ?? null,
          },
          usd: {
            settled: usdSettled,
            amount: usdSettled ? usdPaid : pendingUsd,
            pending: usdSettled ? 0 : pendingUsd,
            transactionId: occurrence?.usdTransactionId ?? null,
            markOnly: usdSettled && !occurrence?.usdTransactionId && usdPaid > 0,
            paidOn: occurrence?.usdTransaction?.date ?? null,
            accountName: occurrence?.usdTransaction?.account?.name ?? null,
          },
        };
        if (occurrence?.status === "PAID") {
          amount = Number(occurrence.amount ?? 0);
          amountPen = parts.pen.amount;
          amountUsd = parts.usd.amount;
        } else {
          // Pendiente o en parte: lo que falta de cada moneda (la parte resuelta ya no suma).
          amountPen = parts.pen.pending;
          amount = amountPen;
          amountUsd = parts.usd.pending;
        }
      } else {
        const paid = occurrence?.amount != null;
        amount = paid ? Number(occurrence.amount) : (statementAmount ?? estimated);
        amountPen = amount;
        amountUsd = 0;
      }

      return {
        key: `${payment.id}:${toUTCDateInputValue(dueDate)}`,
        scheduledPaymentId: payment.id,
        name: payment.name,
        type: payment.type,
        categoryName: payment.category?.name ?? null,
        dueDate,
        dueDateValue: toUTCDateInputValue(dueDate),
        status: occurrence?.status ?? (dueDate < today ? "OVERDUE" : "PENDING"),
        amount,
        amountPen,
        parts,
        estimated,
        statementAmount,
        estimatedUsd,
        statementAmountUsd,
        amountUsd,
        exchangeRate,
        cycleChange,
        installment: loanInstallment
          ? {
              number: loanInstallment.number,
              count: loanInstallment.count,
              principal: loanInstallment.principal,
              interest: loanInstallment.interest,
              insurance: loanInstallment.insurance,
              balance: loanInstallment.balance,
            }
          : null,
        transactionId: occurrence?.transactionId ?? null,
        usdTransactionId: occurrence?.usdTransactionId ?? null,
        accountId: payment.accountId,
        paymentMethod: payment.paymentMethod,
        cycle: cycle ? { start: cycle.start, end: cycle.end, closing: cycle.closing, open: cycle.end > today } : null,
      };
    })
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.name.localeCompare(b.name));
}

// Un vencimiento puntual (para la página de deuda del estado de cuenta de una tarjeta).
export async function getCalendarEntry(scheduledPaymentId: string, dueDateValue: string) {
  const userId = await requireUserId();
  const dueDate = parseDateOnly(dueDateValue);
  if (!dueDate) return null;

  const payment = await prisma.scheduledPayment.findFirst({
    where: { id: scheduledPaymentId, userId },
    include: PAYMENT_INCLUDE,
  });
  if (!payment) return null;

  // Solo devuelve algo si `dueDate` es un vencimiento real del pago.
  const [entry] = await buildEntries(userId, [payment], dueDate, shiftDay(dueDate, 1));
  return entry ?? null;
}

// Vencimientos de un pago en [start, end), con su estado (para la página de un préstamo).
export async function getPaymentEntries(scheduledPaymentId: string, start: Date, end: Date) {
  const userId = await requireUserId();
  const payment = await prisma.scheduledPayment.findFirst({
    where: { id: scheduledPaymentId, userId },
    include: PAYMENT_INCLUDE,
  });
  return payment ? buildEntries(userId, [payment], start, end) : [];
}

export async function getCalendarMonth(year: number, month: number) {
  const userId = await requireUserId();
  const { start, end } = monthRange(year, month);
  const payments = await loadActivePayments(userId);
  return buildEntries(userId, payments, start, end);
}

// Vencidos sin pagar (hasta 90 días atrás) y lo que vence en los próximos 7 días.
export async function getUpcomingAndOverdue() {
  const userId = await requireUserId();
  const today = todayInLima();
  const payments = await loadActivePayments(userId);
  const entries = await buildEntries(
    userId,
    payments,
    shiftDay(today, -OVERDUE_LOOKBACK_DAYS),
    shiftDay(today, UPCOMING_DAYS)
  );
  return {
    // Un vencimiento pagado en parte sigue pendiente por lo que falta.
    overdue: entries.filter((e) => e.status === "OVERDUE" || (e.status === "PARTIAL" && e.dueDate < today)),
    upcoming: entries.filter((e) => e.dueDate >= today && (e.status === "PENDING" || e.status === "PARTIAL")),
  };
}

export type ScheduledPaymentRow = {
  id: string;
  type: ScheduledPaymentType;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  paymentMethod: PaymentMethod | null;
  amount: number | null;
  frequency: ScheduleFrequency;
  startDate: Date;
  endDate: Date | null;
  closingDay: number | null;
  dueDay: number | null;
  active: boolean;
  nextDate: Date | null;
  // Solo tarjeta: cierre del próximo estado de cuenta.
  nextClosingDate: Date | null;
};

export async function getScheduledPayments(): Promise<ScheduledPaymentRow[]> {
  const userId = await requireUserId();
  const today = todayInLima();

  const payments = await prisma.scheduledPayment.findMany({
    where: { userId },
    include: { category: { select: { name: true } }, account: { select: { name: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });

  const sources = await loadDateSources(payments, today, shiftDay(today, NEXT_LOOKAHEAD_DAYS));

  return payments.map((p) => {
    const next = p.active ? nextPaymentOccurrence(p, sources(p.id), today) : null;
    return {
      id: p.id,
      type: p.type,
      name: p.name,
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? null,
      accountId: p.accountId,
      accountName: p.account?.name ?? null,
      paymentMethod: p.paymentMethod,
      amount: p.amount != null ? Number(p.amount) : null,
      frequency: p.frequency,
      startDate: p.startDate,
      endDate: p.endDate,
      closingDay: p.closingDay,
      dueDay: p.dueDay,
      active: p.active,
      nextDate: next?.dueDate ?? null,
      nextClosingDate: next?.cycle?.closing ?? null,
    };
  });
}

// ---------- Cronograma de una tarjeta ----------

export type BillingScheduleRow = {
  // 0–11, mes de facturación (el del cierre).
  month: number;
  cycleStart: Date;
  closingDate: Date;
  dueDate: Date;
  // false = todavía sale de la regla (no se cargó del cronograma del banco).
  fromSchedule: boolean;
  // Estado del vencimiento en el calendario (null si la regla aún no empezó).
  entry: CalendarEntry | null;
};

export async function getCardSchedule(scheduledPaymentId: string, year: number) {
  const userId = await requireUserId();

  const payment = await prisma.scheduledPayment.findFirst({
    where: { id: scheduledPaymentId, userId, type: "CREDIT_CARD" },
    include: PAYMENT_INCLUDE,
  });
  if (!payment?.closingDay || !payment.dueDay) return null;
  const rule = { startDate: payment.startDate, closingDay: payment.closingDay, dueDay: payment.dueDay };

  // Incluye diciembre del año anterior: su cierre es el inicio de los consumos de enero.
  const first = year * 12;
  const periods = await prisma.cardBillingPeriod.findMany({
    where: { scheduledPaymentId: payment.id, month: { gte: monthStart(first - 1), lt: monthStart(first + 12) } },
    select: { closingDate: true, dueDate: true },
  });
  const byMonth = periodsByMonth(periods);

  const months = Array.from({ length: 12 }, (_, month) => {
    const current = billingMonth(rule, byMonth, first + month);
    const previous = billingMonth(rule, byMonth, first + month - 1);
    return { month, ...current, cycleStart: shiftDay(previous.closingDate, 1) };
  });

  const dueTimes = months.map((m) => m.dueDate.getTime());
  const entries = await buildEntries(
    userId,
    [payment],
    new Date(Math.min(...dueTimes)),
    shiftDay(new Date(Math.max(...dueTimes)), 1)
  );
  const entryByDue = new Map(entries.map((e) => [e.dueDate.getTime(), e]));

  return {
    payment: { id: payment.id, name: payment.name },
    rows: months.map((m): BillingScheduleRow => ({ ...m, entry: entryByDue.get(m.dueDate.getTime()) ?? null })),
  };
}

// ---------- Sugerencias ----------

export type ScheduleSuggestion = {
  key: string;
  name: string;
  categoryId: string;
  categoryName: string;
  // Null si eran consumos con tarjeta (sin cuenta).
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
  amount: number;
  day: number;
  // "YYYY-MM-DD" de la próxima fecha con ese día.
  startDate: string;
  months: number;
};

const SUGGESTION_MONTHS = 6;
const MIN_SUGGESTION_MONTHS = 3;
// Un pago mensual aparece ~1 vez por mes; "Almuerzo" aparece muchas. Se
// descartan los motivos con más de este promedio por mes.
const MAX_PER_MONTH = 2;
const SUGGESTIONS_SHOWN = 6;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function mostFrequent<T>(values: T[]) {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// Gastos que se repitieron en varios meses y todavía no están programados.
export async function getScheduleSuggestions(): Promise<ScheduleSuggestion[]> {
  const userId = await requireUserId();
  const today = todayInLima();
  const first = shiftMonth(today.getUTCFullYear(), today.getUTCMonth() + 1, -(SUGGESTION_MONTHS - 1));

  const [transactions, scheduled] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, kind: "EXPENSE", reason: { not: null }, date: { gte: monthRange(first.year, first.month).start } },
      select: {
        date: true,
        amount: true,
        reason: true,
        categoryId: true,
        accountId: true,
        paymentMethod: true,
        category: { select: { name: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.scheduledPayment.findMany({ where: { userId }, select: { name: true } }),
  ]);

  const scheduledNames = new Set(scheduled.map((p) => normalizeReason(p.name)));
  const groups = new Map<string, typeof transactions>();
  for (const t of transactions) {
    const key = normalizeReason(t.reason!);
    if (!key || scheduledNames.has(key)) continue;
    const group = groups.get(key) ?? [];
    group.push(t);
    groups.set(key, group);
  }

  const suggestions: ScheduleSuggestion[] = [];
  for (const [key, group] of groups) {
    const months = new Set(group.map((t) => monthKey(t.date.getUTCFullYear(), t.date.getUTCMonth() + 1))).size;
    if (months < MIN_SUGGESTION_MONTHS || group.length > months * MAX_PER_MONTH) continue;

    // Llegan del más reciente al más antiguo: el primero da nombre y monto.
    const latest = group[0];
    const categoryId = mostFrequent(group.map((t) => t.categoryId));
    const day = median(group.map((t) => t.date.getUTCDate()));
    suggestions.push({
      key,
      name: latest.reason!,
      categoryId,
      categoryName: group.find((t) => t.categoryId === categoryId)!.category.name,
      accountId: mostFrequent(group.map((t) => t.accountId)),
      paymentMethod: mostFrequent(group.map((t) => t.paymentMethod)),
      amount: Number(latest.amount),
      day,
      startDate: toUTCDateInputValue(nextDayOfMonth(day, today)),
      months,
    });
  }

  return suggestions.sort((a, b) => b.months - a.months || b.amount - a.amount).slice(0, SUGGESTIONS_SHOWN);
}
