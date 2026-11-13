import { shiftDay, toUTCDateInputValue } from "@/lib/date";

export type IcalEvent = {
  uid: string;
  // Día calendario como medianoche UTC (el evento dura todo el día).
  date: Date;
  summary: string;
  description?: string;
  url?: string;
  // Alerta el día anterior a las 9:00.
  alarm?: boolean;
};

const encoder = new TextEncoder();

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Las líneas se doblan a 75 octetos (UTF-8) sin partir caracteres; las
// continuaciones empiezan con un espacio, que cuenta dentro del límite.
function foldLine(line: string) {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function dateValue(date: Date) {
  return toUTCDateInputValue(date).replaceAll("-", "");
}

function timestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function eventLines(event: IcalEvent, stamp: string) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dateValue(event.date)}`,
    `DTEND;VALUE=DATE:${dateValue(shiftDay(event.date, 1))}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push("TRANSP:TRANSPARENT", "STATUS:CONFIRMED");
  if (event.alarm) {
    // El evento empieza a las 00:00: 15 horas antes es el día anterior a las 9:00.
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT15H",
      `DESCRIPTION:${escapeText(event.summary)}`,
      "END:VALARM"
    );
  }
  lines.push("END:VEVENT");
  return lines;
}

export function buildCalendar({ name, events }: { name: string; events: IcalEvent[] }) {
  const stamp = timestamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mis finanzas//Pagos//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:America/Lima",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events.flatMap((event) => eventLines(event, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
