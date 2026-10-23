import { shiftDay } from "@/lib/date";

// Cronograma de facturación de una tarjeta: fines de semana y lectura del texto
// que publica el banco. Fechas como medianoche UTC.

function isWeekend(date: Date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

// Los bancos cierran el día hábil anterior y cobran el siguiente.
export function previousBusinessDay(date: Date) {
  let result = date;
  while (isWeekend(result)) result = shiftDay(result, -1);
  return result;
}

export function nextBusinessDay(date: Date) {
  let result = date;
  while (isWeekend(result)) result = shiftDay(result, 1);
  return result;
}

export type ParsedBillingRow = { month: number; closingDate: Date; dueDate: Date };

const FULL_MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const SHORT_MONTHS: Record<string, number> = {
  ene: 0,
  feb: 1,
  mar: 2,
  abr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  set: 8,
  sep: 8,
  oct: 9,
  nov: 10,
  dic: 11,
};

// Cada fila empieza con el mes de facturación escrito completo ("Octubre").
const ROW_START = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/g;
// Fechas como "23 Oct.", "23 de Nov." o "5 noviembre".
const DATE = /(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)[a-z]*\.?/g;

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function makeDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCMonth() === month ? date : null;
}

// Lee un cronograma copiado de la web o el PDF del banco, con filas como
// "Octubre 26 Set. al 23 Oct. lunes, 23 de Nov.": de cada fila toma el cierre
// (penúltima fecha) y el pago (última). El año sale del texto o de `defaultYear`;
// fechas de diciembre o enero del año vecino se corrigen solas.
export function parseBillingSchedule(text: string, defaultYear: number) {
  const normalized = normalize(text);
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : defaultYear;

  const starts = [...normalized.matchAll(ROW_START)];
  const rows = new Map<number, ParsedBillingRow>();

  starts.forEach((start, i) => {
    const month = start[1] === "setiembre" ? 8 : FULL_MONTHS.indexOf(start[1]);
    const segmentStart = (start.index ?? 0) + start[0].length;
    const segment = normalized.slice(segmentStart, starts[i + 1]?.index ?? normalized.length);
    const dates = [...segment.matchAll(DATE)].map((match) => ({
      day: Number(match[1]),
      month: SHORT_MONTHS[match[2]],
    }));
    if (dates.length < 2 || rows.has(month)) return;

    const closing = dates[dates.length - 2];
    const due = dates[dates.length - 1];
    // El cierre cae cerca del mes de facturación: un "dic" en enero es del año anterior.
    const closingYear = year + (closing.month - month > 6 ? -1 : month - closing.month > 6 ? 1 : 0);
    const dueYear = closingYear + (due.month < closing.month ? 1 : 0);
    const closingDate = makeDate(closingYear, closing.month, closing.day);
    const dueDate = makeDate(dueYear, due.month, due.day);
    if (!closingDate || !dueDate || dueDate <= closingDate) return;

    rows.set(month, { month, closingDate, dueDate });
  });

  return { year, rows: [...rows.values()].sort((a, b) => a.month - b.month) };
}
