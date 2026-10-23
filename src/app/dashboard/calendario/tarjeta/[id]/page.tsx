import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardBillingScheduleForm } from "@/components/finance/card-billing-schedule-form";
import { getCardSchedule } from "@/features/schedule/queries";
import { shiftDay, todayInLima, toUTCDateInputValue } from "@/lib/date";

function parseYear(raw: string | undefined) {
  const year = Number(raw);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : todayInLima().getUTCFullYear();
}

export default async function CronogramaTarjetaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const [{ id }, { year: yearParam }] = await Promise.all([params, searchParams]);
  const year = parseYear(yearParam);

  const schedule = await getCardSchedule(id, year);
  if (!schedule) notFound();

  // Diciembre del año anterior cierra justo antes de que empiecen los consumos de enero.
  const previousClosing = toUTCDateInputValue(shiftDay(schedule.rows[0].cycleStart, -1));

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/calendario"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Calendario
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Cronograma de facturación</span>
          <h1 className="font-heading text-2xl font-medium italic md:text-3xl">{schedule.payment.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon">
            <Link href={`?year=${year - 1}`}>
              <ChevronLeft className="size-4" />
              <span className="sr-only">Año anterior</span>
            </Link>
          </Button>
          <span className="min-w-14 text-center text-sm font-medium tabular-nums">{year}</span>
          <Button asChild variant="outline" size="icon">
            <Link href={`?year=${year + 1}`}>
              <ChevronRight className="size-4" />
              <span className="sr-only">Año siguiente</span>
            </Link>
          </Button>
        </div>
      </div>

      <CardBillingScheduleForm
        scheduledPaymentId={schedule.payment.id}
        year={year}
        previousClosing={previousClosing}
        rows={schedule.rows.map((row) => ({
          month: row.month,
          closing: toUTCDateInputValue(row.closingDate),
          due: toUTCDateInputValue(row.dueDate),
          fromSchedule: row.fromSchedule,
          entry: row.entry
            ? {
                status: row.entry.status,
                amount: row.entry.amount,
                hasStatement: row.entry.statementAmount !== null,
                rouletteCount: row.entry.roulette?.count ?? 0,
                href: `/dashboard/calendario/pago/${schedule.payment.id}/${row.entry.dueDateValue}`,
              }
            : null,
        }))}
      />
    </div>
  );
}
