import type { ScheduledPaymentType, ScheduleFrequency } from "@/generated/prisma/client";
import { shiftDay } from "@/lib/date";

// Todas las fechas son días calendario como medianoche UTC (igual que Transaction.date).

export type ScheduleRule = {
  frequency: ScheduleFrequency;
  startDate: Date;
  endDate: Date | null;
};

const MONTH_STEP: Record<Exclude<ScheduleFrequency, "ONCE" | "WEEKLY">, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Cuánto hacia adelante se busca la próxima fecha (alcanza para una anual).
const NEXT_LOOKAHEAD_DAYS = 400;

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

// El día se recorta al último del mes: un pago del 31 cae el 30 o el 28/29.
// `monthIndex` puede salirse de 0–11 (se normaliza al año que corresponda).
export function clampedDate(year: number, monthIndex: number, day: number) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  return new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m))));
}

// Fechas de la regla dentro de [start, end). `endDate` es inclusiva.
export function occurrencesInRange(rule: ScheduleRule, start: Date, end: Date): Date[] {
  const { frequency, startDate, endDate } = rule;
  const limit = endDate && shiftDay(endDate, 1) < end ? shiftDay(endDate, 1) : end;
  const from = startDate > start ? startDate : start;
  if (from >= limit) return [];

  if (frequency === "ONCE") return startDate >= start ? [startDate] : [];

  const dates: Date[] = [];

  if (frequency === "WEEKLY") {
    const skipWeeks = Math.ceil((from.getTime() - startDate.getTime()) / WEEK_MS);
    for (let date = shiftDay(startDate, skipWeeks * 7); date < limit; date = shiftDay(date, 7)) {
      dates.push(date);
    }
    return dates;
  }

  const step = MONTH_STEP[frequency];
  const day = startDate.getUTCDate();
  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth();
  const monthsToFrom = (from.getUTCFullYear() - startYear) * 12 + (from.getUTCMonth() - startMonth);
  // Se arranca un paso antes por si el recorte de día deja la fecha antes de `from`.
  for (let offset = Math.max(0, Math.floor(monthsToFrom / step) - 1) * step; ; offset += step) {
    const date = clampedDate(startYear, startMonth + offset, day);
    if (date >= limit) break;
    if (date >= from) dates.push(date);
  }
  return dates;
}

// Primera fecha desde `from` con ese día exacto. Se salta los meses donde el día
// no existe para que la regla guarde el día real (un 31 no queda como 28 para
// siempre); los meses cortos después se recortan en `occurrencesInRange`.
export function nextDayOfMonth(day: number, from: Date) {
  for (let offset = 0; ; offset++) {
    const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset, day));
    if (date.getUTCDate() === day && date >= from) return date;
  }
}

// ---------- Tarjetas ----------

// Un mes del cronograma del banco. El mes de facturación es el del cierre.
export type BillingPeriod = { closingDate: Date; dueDate: Date };

export type CardRule = { startDate: Date; closingDay: number; dueDay: number };

export type CardOccurrence = {
  dueDate: Date;
  closingDate: Date;
  // Consumos de este estado de cuenta: [cycleStart, closingDate].
  cycleStart: Date;
  // true = la fecha viene del cronograma; false = de la regla.
  fromSchedule: boolean;
};

// Meses como número correlativo (año × 12 + mes) para recorrerlos sin Date.
export function monthIndex(date: Date) {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

export function monthStart(index: number) {
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1));
}

// Cierre y pago de un mes de facturación según la regla: si el cierre es antes
// del día de pago, se paga ese mismo mes; si no, el siguiente.
export function ruleBillingMonth(rule: CardRule, index: number): BillingPeriod {
  const year = Math.floor(index / 12);
  const month = index % 12;
  return {
    closingDate: clampedDate(year, month, rule.closingDay),
    dueDate: clampedDate(year, month + (rule.closingDay < rule.dueDay ? 0 : 1), rule.dueDay),
  };
}

// Mes de facturación del cronograma si existe; si no, el de la regla.
export function billingMonth(rule: CardRule, periodsByMonth: Map<number, BillingPeriod>, index: number) {
  const period = periodsByMonth.get(index);
  return period ? { ...period, fromSchedule: true } : { ...ruleBillingMonth(rule, index), fromSchedule: false };
}

export function periodsByMonth(periods: BillingPeriod[]) {
  return new Map(periods.map((period) => [monthIndex(period.closingDate), period]));
}

// Vencimientos de la tarjeta en [start, end). Los meses de la regla arrancan en
// `startDate`; los del cronograma siempre cuentan. El pago cae a lo sumo dos
// meses después del cierre, por eso se recorre desde dos meses antes.
export function cardOccurrences(rule: CardRule, periods: BillingPeriod[], start: Date, end: Date) {
  const byMonth = periodsByMonth(periods);
  const result: CardOccurrence[] = [];
  for (let index = monthIndex(start) - 2; index <= monthIndex(end); index++) {
    const month = billingMonth(rule, byMonth, index);
    if (month.dueDate < start || month.dueDate >= end) continue;
    if (!month.fromSchedule && month.dueDate < rule.startDate) continue;
    const previous = billingMonth(rule, byMonth, index - 1);
    result.push({ ...month, cycleStart: shiftDay(previous.closingDate, 1) });
  }
  return result.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

// ---------- Cualquier pago ----------

export type PaymentRule = ScheduleRule & {
  type: ScheduledPaymentType;
  closingDay: number | null;
  dueDay: number | null;
};

// Fechas guardadas que reemplazan a la regla: el cronograma de una tarjeta y las
// cuotas de un préstamo.
export type PaymentDateSources = { periods: BillingPeriod[]; installmentDates: Date[] };

export const NO_DATE_SOURCES: PaymentDateSources = { periods: [], installmentDates: [] };

export type PaymentOccurrence = {
  dueDate: Date;
  // Solo tarjeta. `end` es exclusivo (día siguiente al cierre).
  cycle: { start: Date; end: Date; closing: Date } | null;
};

function cardRule(payment: PaymentRule): CardRule | null {
  return payment.closingDay && payment.dueDay
    ? { startDate: payment.startDate, closingDay: payment.closingDay, dueDay: payment.dueDay }
    : null;
}

// Vencimientos de un pago en [start, end): los préstamos son sus cuotas y las
// tarjetas usan su cronograma.
export function paymentOccurrences(
  payment: PaymentRule,
  sources: PaymentDateSources,
  start: Date,
  end: Date
): PaymentOccurrence[] {
  if (payment.type === "LOAN") {
    return sources.installmentDates
      .filter((dueDate) => dueDate >= start && dueDate < end)
      .sort((a, b) => a.getTime() - b.getTime())
      .map((dueDate) => ({ dueDate, cycle: null }));
  }
  const rule = cardRule(payment);
  if (!rule) return occurrencesInRange(payment, start, end).map((dueDate) => ({ dueDate, cycle: null }));
  return cardOccurrences(rule, sources.periods, start, end).map((o) => ({
    dueDate: o.dueDate,
    cycle: { start: o.cycleStart, end: shiftDay(o.closingDate, 1), closing: o.closingDate },
  }));
}

export function isPaymentDueDate(payment: PaymentRule, sources: PaymentDateSources, date: Date) {
  return paymentOccurrences(payment, sources, date, shiftDay(date, 1)).length === 1;
}

export function nextPaymentOccurrence(payment: PaymentRule, sources: PaymentDateSources, from: Date) {
  return paymentOccurrences(payment, sources, from, shiftDay(from, NEXT_LOOKAHEAD_DAYS))[0] ?? null;
}
