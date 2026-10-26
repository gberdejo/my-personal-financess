import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarMonthGrid } from "@/components/finance/calendar-month-grid";
import { MonthNav } from "@/components/finance/month-nav";
import { OccurrenceRow } from "@/components/finance/occurrence-row";
import { ScheduleSuggestions } from "@/components/finance/schedule-suggestions";
import { ScheduledPaymentFormDialog } from "@/components/finance/scheduled-payment-form-dialog";
import { ScheduledPaymentsList } from "@/components/finance/scheduled-payments-list";
import { getAccounts } from "@/features/accounts/queries";
import { getCategories } from "@/features/categories/queries";
import { getRouletteOpsForRange } from "@/features/roulette/queries";
import {
  getCalendarMonth,
  getScheduledPayments,
  getScheduleSuggestions,
  getUpcomingAndOverdue,
  type CalendarEntry,
} from "@/features/schedule/queries";
import { daysUntil, monthLabel, monthRange, parseMonthParam } from "@/lib/date";
import { formatCurrency } from "@/lib/format";
import { summarizeRoulette } from "@/lib/roulette";
import { cn } from "@/lib/utils";

function total(entries: CalendarEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.amount, 0);
}

function dueLabel(entry: CalendarEntry) {
  const days = daysUntil(entry.dueDate);
  if (days < -1) return `Venció hace ${-days} días`;
  if (days === -1) return "Venció ayer";
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  return `Vence en ${days} días`;
}

function countLabel(count: number, singular: string, plural: string) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: monthParam } = await searchParams;
  const { year, month } = parseMonthParam(monthParam);
  const range = monthRange(year, month);

  const [entries, operations, { overdue, upcoming }, payments, suggestions, accounts, categories] = await Promise.all([
    getCalendarMonth(year, month),
    getRouletteOpsForRange(range.start, range.end),
    getUpcomingAndOverdue(),
    getScheduledPayments(),
    getScheduleSuggestions(),
    getAccounts(),
    getCategories("EXPENSE"),
  ]);

  const pendingInMonth = entries.filter((e) => e.status === "PENDING" || e.status === "OVERDUE");
  const attention = [...overdue, ...upcoming];
  const hasCard = payments.some((p) => p.type === "CREDIT_CARD");
  const rouletteFees = summarizeRoulette(operations).fees;
  const registeredFees = summarizeRoulette(operations.filter((op) => op.status === "DONE")).fees;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl font-medium italic md:text-3xl">Calendario</h1>
        <div className="flex items-center justify-between gap-2">
          <MonthNav year={year} month={month} />
          <ScheduledPaymentFormDialog accounts={accounts} categories={categories} hasCard={hasCard} />
        </div>
      </div>

      {payments.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sin pagos programados todavía</CardTitle>
            <CardDescription>
              Agregá tus servicios (luz, agua, internet), gastos fijos y tarjetas de crédito con su fecha de pago.
              El calendario te muestra qué vence cada mes y, al pagarlos, se registran como gastos. Los préstamos se
              cargan desde Préstamos y sus cuotas aparecen acá.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className={cn("grid gap-4", operations.length > 0 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
            <Card>
              <CardHeader>
                <CardDescription>Por pagar en {monthLabel(year, month).toLowerCase()}</CardDescription>
                <CardTitle className="font-sans text-2xl not-italic font-semibold tabular-nums">
                  {formatCurrency(total(pendingInMonth))}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {countLabel(pendingInMonth.length, "pago pendiente", "pagos pendientes")}
                </p>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Vencidos</CardDescription>
                <CardTitle
                  className={cn(
                    "font-sans text-2xl not-italic font-semibold tabular-nums",
                    overdue.length > 0 && "text-destructive"
                  )}
                >
                  {formatCurrency(total(overdue))}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {overdue.length === 0 ? "Estás al día" : `${overdue.length} sin pagar`}
                </p>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Próximos 7 días</CardDescription>
                <CardTitle className="font-sans text-2xl not-italic font-semibold tabular-nums text-expense">
                  {formatCurrency(total(upcoming))}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {countLabel(upcoming.length, "pago por vencer", "pagos por vencer")}
                </p>
              </CardHeader>
            </Card>
            {operations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardDescription>Comisiones de ruleteo</CardDescription>
                  <CardTitle className="font-sans text-2xl not-italic font-semibold tabular-nums text-expense">
                    {formatCurrency(rouletteFees)}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {countLabel(operations.length, "operación", "operaciones")} ·{" "}
                    <span className="tabular-nums">{formatCurrency(registeredFees)}</span> registradas
                  </p>
                </CardHeader>
              </Card>
            )}
          </div>

          <CalendarMonthGrid
            year={year}
            month={month}
            entries={entries}
            operations={operations}
            accounts={accounts}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="pb-0">
              <CardHeader>
                <CardTitle>Vencidos y próximos</CardTitle>
                <CardDescription>Lo que hay que pagar ya, sin importar el mes que estés viendo.</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                {attention.length === 0 ? (
                  <p className="border-t px-4 py-4 text-sm text-muted-foreground">
                    No hay pagos vencidos ni por vencer esta semana.
                  </p>
                ) : (
                  <ul className="[&>li]:border-t">
                    {attention.map((entry) => (
                      <OccurrenceRow
                        key={entry.key}
                        entry={entry}
                        accounts={accounts}
                        detail={dueLabel(entry)}
                      />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <ScheduledPaymentsList payments={payments} accounts={accounts} categories={categories} />
          </div>
        </>
      )}

      <ScheduleSuggestions suggestions={suggestions} accounts={accounts} categories={categories} />
    </div>
  );
}
