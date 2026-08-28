export function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseMonthParam(month?: string) {
  const now = new Date();
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, m] = month.split("-").map(Number);
    return { year, month: m };
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

export function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

const monthLabelFormatter = new Intl.DateTimeFormat("es-PE", {
  month: "long",
  year: "numeric",
});

export function monthLabel(year: number, month: number) {
  const label = monthLabelFormatter.format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function dayRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function shiftDay(date: Date, delta: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + delta);
  return result;
}

const dayLabelFormatter = new Intl.DateTimeFormat("es-PE", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});

export function dayLabel(date: Date) {
  const label = dayLabelFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Semana calendario: lunes a domingo.
export function weekRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfWeek = start.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  start.setDate(start.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function shiftWeek(date: Date, delta: number) {
  return shiftDay(date, delta * 7);
}

const weekLabelFormatter = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
});

export function weekLabel(date: Date) {
  const { start, end } = weekRange(date);
  const lastDay = shiftDay(end, -1);
  return `${weekLabelFormatter.format(start)} – ${weekLabelFormatter.format(lastDay)}`;
}
