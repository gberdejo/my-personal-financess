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
