import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardStatementForm } from "@/components/finance/card-statement-form";
import { OccurrenceDialog } from "@/components/finance/occurrence-dialog";
import { getAccounts } from "@/features/accounts/queries";
import { getCalendarEntry } from "@/features/schedule/queries";
import { daysUntil, monthKey } from "@/lib/date";
import { formatCountdown, formatCurrency, formatDate, formatTransactionDate } from "@/lib/format";

export default async function PagoTarjetaPage({ params }: { params: Promise<{ id: string; fecha: string }> }) {
  const { id, fecha } = await params;
  const entry = await getCalendarEntry(id, fecha);
  if (!entry || entry.type !== "CREDIT_CARD") notFound();

  const accounts = await getAccounts();
  const debt = entry.statementAmount ?? entry.estimated;

  // Vuelve a la tarjeta, en el ciclo de este vencimiento (el mes del cierre).
  const backHref = entry.cycle
    ? `/dashboard/tarjetas/${entry.scheduledPaymentId}?ciclo=${monthKey(entry.cycle.closing.getUTCFullYear(), entry.cycle.closing.getUTCMonth() + 1)}`
    : `/dashboard/tarjetas/${entry.scheduledPaymentId}`;

  return (
    <div className="flex flex-col gap-4">
      <Link href={backHref} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {entry.name}
      </Link>

      <Card>
        <div className="flex flex-col gap-5 px-(--card-spacing)">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
                  Tarjeta de crédito
                </span>
                <span>
                  Vence el {formatTransactionDate(entry.dueDate)} · {formatCountdown(daysUntil(entry.dueDate))}
                </span>
              </div>
              <h1 className="font-heading text-2xl font-medium italic md:text-3xl">{entry.name}</h1>
              {entry.cycle && (
                <p className="text-xs text-muted-foreground">
                  Consumos del {formatDate(entry.cycle.start)} al {formatDate(entry.cycle.closing)} ·{" "}
                  <Link
                    href={`/dashboard/tarjetas/${entry.scheduledPaymentId}/cronograma?year=${entry.cycle.closing.getUTCFullYear()}`}
                    className="font-medium text-primary hover:underline"
                  >
                    Cronograma de facturación
                  </Link>
                </p>
              )}
            </div>
            <OccurrenceDialog entry={entry} accounts={accounts}>
              <Button variant={entry.status === "PAID" ? "outline" : "default"}>
                {entry.cycleChange && <TriangleAlert className="text-amber-600 dark:text-amber-400" />}
                {entry.status === "PAID" ? "Pagada" : entry.status === "SKIPPED" ? "Omitida" : "Marcar como pagada"}
              </Button>
            </OccurrenceDialog>
          </div>

          <CardStatementForm
            scheduledPaymentId={entry.scheduledPaymentId}
            dueDateValue={entry.dueDateValue}
            statementAmount={entry.statementAmount}
            estimated={entry.estimated}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Deuda</span>
              <span className="text-lg font-semibold tabular-nums md:text-xl">{formatCurrency(debt)}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Estimado de consumos</span>
              <span className="text-lg font-semibold tabular-nums md:text-xl">{formatCurrency(entry.estimated)}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
