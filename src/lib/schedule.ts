import type { ScheduleFrequency } from "@/generated/prisma/client";
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

export function isOccurrenceDate(rule: ScheduleRule, date: Date) {
  return occurrencesInRange(rule, date, shiftDay(date, 1)).length === 1;
}

export function nextOccurrence(rule: ScheduleRule, from: Date) {
  return occurrencesInRange(rule, from, shiftDay(from, NEXT_LOOKAHEAD_DAYS))[0] ?? null;
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

// Ciclo de facturación que se paga en `dueDate`: si el cierre es antes del día
// de pago, cierra ese mismo mes; si no, el mes anterior. Devuelve [start, end)
// para filtrar gastos y el día de cierre. `dueDay` es el día de pago sin
// recortar (la fecha puede caer antes en meses cortos).
export function cardCycle(dueDate: Date, dueDay: number, closingDay: number) {
  const year = dueDate.getUTCFullYear();
  const month = dueDate.getUTCMonth() - (closingDay < dueDay ? 0 : 1);
  const closing = clampedDate(year, month, closingDay);
  const previousClosing = clampedDate(year, month - 1, closingDay);
  return { start: shiftDay(previousClosing, 1), end: shiftDay(closing, 1), closing };
}
