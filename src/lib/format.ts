const currencyFormatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

export function formatCurrency(amount: number) {
  return currencyFormatter.format(amount);
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
