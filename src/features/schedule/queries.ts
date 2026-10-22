import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { monthKey, monthRange, shiftDay, shiftMonth, todayInLima, toUTCDateInputValue } from "@/lib/date";
import { normalizeReason } from "@/lib/reason";
import { cardCycle, nextDayOfMonth, nextOccurrence, occurrencesInRange } from "@/lib/schedule";
import type {
  PaymentMethod,
  ScheduledPaymentType,
  ScheduleFrequency,
} from "@/generated/prisma/client";

export type OccurrenceStatusView = "PENDING" | "OVERDUE" | "PAID" | "SKIPPED";

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
  // Pagado: lo que se pagó. Pendiente: el estimado (en tarjeta, los gastos del ciclo).
  amount: number;
  estimated: number;
  transactionId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
  // Solo tarjeta. `end` es exclusivo; `open` = el ciclo todavía no cerró.
  cycle: { start: Date; end: Date; open: boolean } | null;
};

// Cuánto hacia atrás se buscan cuotas vencidas sin pagar.
const OVERDUE_LOOKBACK_DAYS = 90;
const UPCOMING_DAYS = 7;

async function loadActivePayments(userId: string) {
  return prisma.scheduledPayment.findMany({
    where: { userId, active: true },
    include: { category: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

type LoadedPayment = Awaited<ReturnType<typeof loadActivePayments>>[number];

// Cruza las fechas de cada regla en [start, end) con las cuotas ya resueltas y,
// para tarjetas, suma los gastos con tarjeta de cada ciclo.
async function buildEntries(userId: string, payments: LoadedPayment[], start: Date, end: Date) {
  const today = todayInLima();

  const dated = payments.flatMap((payment) =>
    occurrencesInRange(payment, start, end).map((dueDate) => {
      const cycle =
        payment.type === "CREDIT_CARD" && payment.closingDay
          ? cardCycle(dueDate, payment.startDate.getUTCDate(), payment.closingDay)
          : null;
      return { payment, dueDate, cycle };
    })
  );
  if (dated.length === 0) return [];

  const stored = await prisma.scheduledOccurrence.findMany({
    where: {
      scheduledPaymentId: { in: [...new Set(dated.map((d) => d.payment.id))] },
      dueDate: { gte: start, lt: end },
    },
  });
  const storedByKey = new Map(stored.map((o) => [`${o.scheduledPaymentId}:${o.dueDate.getTime()}`, o]));

  const cycles = dated.flatMap((d) => (d.cycle ? [d.cycle] : []));
  const cardExpenses = cycles.length
    ? await prisma.transaction.findMany({
        where: {
          userId,
          kind: "EXPENSE",
          paymentMethod: "CREDIT_CARD",
          date: {
            gte: new Date(Math.min(...cycles.map((c) => c.start.getTime()))),
            lt: new Date(Math.max(...cycles.map((c) => c.end.getTime()))),
          },
        },
        select: { date: true, amount: true },
      })
    : [];

  return dated
    .map(({ payment, dueDate, cycle }): CalendarEntry => {
      const occurrence = storedByKey.get(`${payment.id}:${dueDate.getTime()}`);
      const estimated = cycle
        ? cardExpenses
            .filter((t) => t.date >= cycle.start && t.date < cycle.end)
            .reduce((sum, t) => sum + Number(t.amount), 0)
        : Number(payment.amount ?? 0);

      return {
        key: `${payment.id}:${toUTCDateInputValue(dueDate)}`,
        scheduledPaymentId: payment.id,
        name: payment.name,
        type: payment.type,
        categoryName: payment.category?.name ?? null,
        dueDate,
        dueDateValue: toUTCDateInputValue(dueDate),
        status: occurrence?.status ?? (dueDate < today ? "OVERDUE" : "PENDING"),
        amount: occurrence?.amount != null ? Number(occurrence.amount) : estimated,
        estimated,
        transactionId: occurrence?.transactionId ?? null,
        accountId: payment.accountId,
        paymentMethod: payment.paymentMethod,
        cycle: cycle ? { start: cycle.start, end: cycle.end, open: cycle.end > today } : null,
      };
    })
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.name.localeCompare(b.name));
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
    overdue: entries.filter((e) => e.status === "OVERDUE"),
    upcoming: entries.filter((e) => e.dueDate >= today && e.status === "PENDING"),
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
  active: boolean;
  nextDate: Date | null;
};

export async function getScheduledPayments(): Promise<ScheduledPaymentRow[]> {
  const userId = await requireUserId();
  const today = todayInLima();

  const payments = await prisma.scheduledPayment.findMany({
    where: { userId },
    include: { category: { select: { name: true } }, account: { select: { name: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });

  return payments.map((p) => ({
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
    active: p.active,
    nextDate: p.active ? nextOccurrence(p, today) : null,
  }));
}

// ---------- Sugerencias ----------

export type ScheduleSuggestion = {
  key: string;
  name: string;
  categoryId: string;
  categoryName: string;
  accountId: string;
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
