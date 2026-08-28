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
});

export function formatDate(date: Date) {
  return dateFormatter.format(date);
}

// Las fechas de transacción se guardan como medianoche UTC (día calendario
// elegido en el formulario). Se formatean en UTC para que no varíen según
// la zona horaria del navegador de quien las mira.
const transactionDateFormatter = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatTransactionDate(date: Date) {
  return transactionDateFormatter.format(date);
}
