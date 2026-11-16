import { prepaymentsForUser } from "@/features/loans/queries";
import { getEntriesForUser } from "@/features/schedule/queries";
import { shiftDay, todayInLima, toUTCDateInputValue } from "@/lib/date";
import { formatCurrency, formatEntryAmount } from "@/lib/format";
import type { IcalEvent } from "@/lib/ical";

const PAST_DAYS = 90;
const FUTURE_DAYS = 400;

const STATUS_LABELS = { PENDING: "Pendiente", OVERDUE: "Vencido", PARTIAL: "Pagado en parte", PAID: "Pagado", SKIPPED: "Omitido" } as const;

// Eventos del feed de un usuario: vencimientos, cierres de tarjeta y prepagos.
// Cada evento es de día completo; la alarma solo va en lo que falta pagar.
export async function buildFeedEvents(userId: string, baseUrl: string): Promise<IcalEvent[]> {
  const today = todayInLima();
  const start = shiftDay(today, -PAST_DAYS);
  const end = shiftDay(today, FUTURE_DAYS);

  const [entries, prepayments] = await Promise.all([
    getEntriesForUser(userId, start, end),
    prepaymentsForUser(userId, start, end),
  ]);

  const events: IcalEvent[] = [];

  for (const entry of entries) {
    const money = formatEntryAmount(entry);
    const summary =
      entry.status === "PAID"
        ? `✓ ${entry.name} · ${money}`
        : entry.status === "SKIPPED"
          ? `Omitida · ${entry.name}`
          : `${entry.name} · ${money}`;

    const description = [
      STATUS_LABELS[entry.status],
      entry.categoryName,
      entry.installment ? `Cuota ${entry.installment.number}/${entry.installment.count}` : null,
      entry.type === "CREDIT_CARD" ? (entry.statementAmount !== null ? "Deuda ingresada" : "Monto estimado") : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const url =
      entry.type === "CREDIT_CARD"
        ? `${baseUrl}/dashboard/tarjetas/${entry.scheduledPaymentId}/${entry.dueDateValue}`
        : `${baseUrl}/dashboard/calendario?month=${entry.dueDateValue.slice(0, 7)}`;

    events.push({
      uid: `${entry.key}@mis-finanzas`,
      date: entry.dueDate,
      summary,
      description,
      url,
      alarm: entry.status === "PENDING" || entry.status === "OVERDUE" || entry.status === "PARTIAL",
    });

    if (entry.type === "CREDIT_CARD" && entry.cycle) {
      events.push({
        uid: `close:${entry.key}@mis-finanzas`,
        date: entry.cycle.closing,
        summary: `Cierre · ${entry.name}`,
        description: "Desde mañana los consumos van al siguiente ciclo",
        url: `${baseUrl}/dashboard/tarjetas/${entry.scheduledPaymentId}?ciclo=${toUTCDateInputValue(entry.cycle.closing).slice(0, 7)}`,
      });
    }
  }

  for (const prepayment of prepayments) {
    const done = prepayment.status === "DONE";
    const money = formatCurrency(prepayment.amount);
    events.push({
      uid: `prepago:${prepayment.id}@mis-finanzas`,
      date: prepayment.date,
      summary: `${done ? "✓ " : ""}Prepago · ${prepayment.loanName} · ${money}`,
      description: prepayment.note ?? "Pago extra a capital",
      url: `${baseUrl}/dashboard/prestamos/${prepayment.scheduledPaymentId}`,
      alarm: !done,
    });
  }

  return events;
}
