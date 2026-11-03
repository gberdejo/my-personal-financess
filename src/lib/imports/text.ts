// Ayudas para leer archivos de bancos y apps (encabezados, montos, fechas).

// Encabezados comparables: sin tildes, minúsculas, solo letras y números
// ("Tipo de Transacción" → "tipo de transaccion").
export function normalizeHeader(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// "1,234.50", "S/ 54.00", "-54.00" o "54,50" (coma decimal, como en Excel en
// español). `null` si está vacío o no es un número.
export function parsePlainAmount(raw: string) {
  let text = raw.replace(/\s/g, "").replace(/^(-?)(s\/|pen)/i, "$1");
  // Coma decimal: "54,50" o "1.234,50".
  if (/,\d{1,2}$/.test(text) && !/\.\d{1,2}$/.test(text)) text = text.replace(/\./g, "").replace(",", ".");
  text = text.replace(/,/g, "");
  if (!text) return null;
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Math.round(Number(text) * 100) / 100;
}

// Lima no tiene horario de verano: siempre UTC−5.
const LIMA_OFFSET_HOURS = 5;

// "19/10/2026 07:33:48" o "2026-10-19 07:33" (hora de Lima; la hora es
// opcional) → el instante real y el día calendario
// como medianoche UTC. `null` si no es una fecha válida.
export function parseLimaDateTime(raw: string) {
  const text = raw.trim();
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const parts = local ?? (iso && [iso[0], iso[3], iso[2], iso[1], iso[4], iso[5], iso[6]]);
  if (!parts) return null;
  const [day, month, year, hour = "0", minute = "0", second = "0"] = parts.slice(1);
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) return null;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  const occurredAt = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) + LIMA_OFFSET_HOURS, Number(minute), Number(second))
  );
  return { date, occurredAt };
}
