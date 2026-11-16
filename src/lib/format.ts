const currencyFormatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

export function formatCurrency(amount: number) {
  return currencyFormatter.format(amount);
}

const usdFormatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "code",
});

// Monto en soles y dólares: "S/ 300.00 + US$ 50.00" (solo la moneda que tenga monto).
export function formatMixed(pen: number, usd: number) {
  if (usd <= 0) return formatCurrency(pen);
  if (pen <= 0) return formatUsd(usd);
  return `${formatCurrency(pen)} + ${formatUsd(usd)}`;
}

// Monto de un vencimiento de tarjeta: "S/ 300.00 + US$ 50.00" y, si ya se pagó
// con dólares, "… a TC 3.80".
export function formatEntryAmount(entry: { amountPen: number; amountUsd: number; exchangeRate: number | null }) {
  const text = formatMixed(entry.amountPen, entry.amountUsd);
  return entry.amountUsd > 0 && entry.exchangeRate !== null ? `${text} a TC ${formatRate(entry.exchangeRate)}` : text;
}

const rateFormatter = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

// Tipo de cambio: "3.80", "3.7525".
export function formatRate(rate: number) {
  return rateFormatter.format(rate);
}

// "US$ 50.00": el código evita confundirlo con el sol.
export function formatUsd(amount: number) {
  return usdFormatter.format(amount).replace("USD", "US$");
}

const dateFormatter = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(date: Date) {
  return dateFormatter.format(date);
}

// Las fechas de transacción se guardan como medianoche UTC (día calendario
// elegido en el formulario). Se formatean en UTC para que no varíen según
// la zona horaria del navegador de quien las mira.
const transactionDateFormatter = new Intl.DateTimeFormat("es-PE", {
  weekday: "long",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatTransactionDate(date: Date) {
  const parts = transactionDateFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} de ${get("month")} ${get("year")}`;
}

// La hora de registro (createdAt) sí es un instante real, a diferencia de
// `date` (que es solo el día calendario). Se muestra en la zona horaria de
// Perú, que es donde vive la app.
const transactionTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});

// Hora de un instante real en Lima ("07:33").
export function formatLimaTime(instant: Date) {
  return transactionTimeFormatter.format(instant);
}

const limaDateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});

// Fecha y hora de un instante real en Lima ("03 nov. 2026, 09:15").
export function formatLimaDateTime(instant: Date) {
  return limaDateTimeFormatter.format(instant);
}

export function formatTransactionDateTime(date: Date, createdAt: Date) {
  return `${formatTransactionDate(date)} ${transactionTimeFormatter.format(createdAt)}`;
}

export function formatCountdown(days: number) {
  if (days === 0) return "es hoy";
  if (days === 1) return "es mañana";
  if (days > 1) return `faltan ${days} días`;
  if (days === -1) return "fue ayer";
  return `fue hace ${-days} días`;
}

// Para el cronograma de tarjetas: "25 dic." y "lunes, 23 de feb.".
const dayMonthFormatter = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });
const weekdayDayMonthFormatter = new Intl.DateTimeFormat("es-PE", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function formatDayMonth(date: Date) {
  return dayMonthFormatter.format(date);
}

export function formatWeekdayDayMonth(date: Date) {
  return weekdayDayMonthFormatter.format(date);
}

// Redondea un monto a céntimos (las sumas en punto flotante dejan restos como 704.7799999999999).
export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
