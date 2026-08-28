import { dayRange, monthRange, parseDateOnly, shiftDay, shiftMonth, weekRange } from "@/lib/date";
import { formatDate } from "@/lib/format";

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "last7Days"
  | "last30Days"
  | "custom";

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "thisWeek", label: "Esta semana" },
  { value: "lastWeek", label: "Semana pasada" },
  { value: "thisMonth", label: "Este mes" },
  { value: "lastMonth", label: "Mes pasado" },
  { value: "last7Days", label: "Últimos 7 días" },
  { value: "last30Days", label: "Últimos 30 días" },
  { value: "custom", label: "Rango personalizado" },
];

export function getCustomRange(startValue: string, endValue: string) {
  const start = parseDateOnly(startValue);
  const end = parseDateOnly(endValue);
  if (!start || !end || start > end) return null;
  return { start, end: shiftDay(end, 1) };
}

export function getPresetRange(preset: PeriodPreset, customStart: string, customEnd: string) {
  const now = new Date();
  switch (preset) {
    case "today":
      return dayRange(now);
    case "yesterday":
      return dayRange(shiftDay(now, -1));
    case "thisWeek":
      return weekRange(now);
    case "lastWeek":
      return weekRange(shiftDay(now, -7));
    case "thisMonth":
      return monthRange(now.getFullYear(), now.getMonth() + 1);
    case "lastMonth": {
      const { year, month } = shiftMonth(now.getFullYear(), now.getMonth() + 1, -1);
      return monthRange(year, month);
    }
    case "last7Days": {
      const { start, end } = dayRange(now);
      return { start: shiftDay(start, -6), end };
    }
    case "last30Days": {
      const { start, end } = dayRange(now);
      return { start: shiftDay(start, -29), end };
    }
    case "custom":
      return getCustomRange(customStart, customEnd);
  }
}

export function getPresetLabel(preset: PeriodPreset, customStart: string, customEnd: string) {
  const presetName = PERIOD_PRESETS.find((item) => item.value === preset)?.label ?? "";

  if (preset === "custom") {
    const range = getCustomRange(customStart, customEnd);
    if (!range) return "Elegí un rango de fechas válido";
    return `${formatDate(range.start)} – ${formatDate(shiftDay(range.end, -1))}`;
  }

  const range = getPresetRange(preset, customStart, customEnd);
  if (!range) return presetName;
  if (preset === "today" || preset === "yesterday") {
    return `${presetName} · ${formatDate(range.start)}`;
  }
  return `${presetName} · ${formatDate(range.start)} – ${formatDate(shiftDay(range.end, -1))}`;
}
