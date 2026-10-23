import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardStatementForm } from "@/components/finance/card-statement-form";
import { ConfirmDeleteButton } from "@/components/finance/confirm-delete-button";
import { OccurrenceDialog } from "@/components/finance/occurrence-dialog";
import { OccurrenceStatusMark, ROULETTE_MARK } from "@/components/finance/occurrence-row";
import { RegisterRouletteDialog } from "@/components/finance/register-roulette-dialog";
import { RouletteOperationDialog } from "@/components/finance/roulette-operation-dialog";
import { RoulettePlanDialog } from "@/components/finance/roulette-plan-dialog";
import { UndoRouletteButton } from "@/components/finance/undo-roulette-button";
import { getAccounts } from "@/features/accounts/queries";
import { getCategories } from "@/features/categories/queries";
import {
  deleteRouletteOperation,
  registerDueRouletteOperations,
  registerRouletteOperation,
} from "@/features/roulette/actions";
import {
  getCommissionCategoryId,
  getRouletteOperations,
  getRouletteProviders,
  type RouletteOperationRow,
} from "@/features/roulette/queries";
import { getCalendarEntry } from "@/features/schedule/queries";
import { daysUntil, monthKey, shiftDay, todayInLima, toUTCDateInputValue } from "@/lib/date";
import { formatCountdown, formatCurrency, formatDate, formatTransactionDate } from "@/lib/format";
import { ROULETTE_STATUS_LABELS } from "@/lib/labels";
import { summarizeRoulette } from "@/lib/roulette";
import { cn } from "@/lib/utils";

function formatPercent(rate: number) {
  return `${(Math.round(rate * 10000) / 100).toLocaleString("es-PE")} %`;
}

export default async function PagoTarjetaPage({ params }: { params: Promise<{ id: string; fecha: string }> }) {
  const { id, fecha } = await params;
  const entry = await getCalendarEntry(id, fecha);
  if (!entry || entry.type !== "CREDIT_CARD") notFound();

  const [operations, providers, accounts, categories, commissionCategoryId] = await Promise.all([
    getRouletteOperations(entry.scheduledPaymentId, entry.dueDate),
    getRouletteProviders(),
    getAccounts(),
    getCategories("EXPENSE"),
    getCommissionCategoryId(),
  ]);

  const today = todayInLima();
  const debt = entry.statementAmount ?? entry.estimated;
  const totals = summarizeRoulette(operations);
  const remaining = Math.max(0, Math.round((debt - totals.received) * 100) / 100);
  const feesDone = summarizeRoulette(operations.filter((op) => op.status === "DONE")).fees;
  const registrable = operations.filter((op) => op.status !== "DONE" && op.fee > 0 && op.date <= today);
  const coverage = debt > 0 ? Math.min((totals.received / debt) * 100, 100) : 0;

  const dayBeforeDue = shiftDay(entry.dueDate, -1);
  const planEnd = dayBeforeDue >= today ? dayBeforeDue : today;
  const backHref = `/dashboard/calendario?month=${monthKey(entry.dueDate.getUTCFullYear(), entry.dueDate.getUTCMonth() + 1)}`;

  return (
    <div className="flex flex-col gap-4">
      <Link href={backHref} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Calendario
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
                    href={`/dashboard/calendario/tarjeta/${entry.scheduledPaymentId}?year=${entry.cycle.closing.getUTCFullYear()}`}
                    className="font-medium text-primary hover:underline"
                  >
                    Cronograma de facturación
                  </Link>
                </p>
              )}
            </div>
            <OccurrenceDialog entry={entry} accounts={accounts}>
              <Button variant={entry.status === "PAID" ? "outline" : "default"}>
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

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Deuda</span>
              <span className="text-lg font-semibold tabular-nums md:text-xl">{formatCurrency(debt)}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Cubierto con ruleteo</span>
              <span className="text-lg font-semibold tabular-nums md:text-xl">{formatCurrency(totals.received)}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Falta cubrir</span>
              <span
                className={cn("text-lg font-semibold tabular-nums md:text-xl", remaining === 0 && "text-income")}
              >
                {formatCurrency(remaining)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Comisiones</span>
              <span className="text-lg font-semibold text-expense tabular-nums md:text-xl">
                {formatCurrency(totals.fees)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(coverage)}
              aria-label={`${coverage.toFixed(0)}% de la deuda cubierto con ruleteo`}
            >
              <div className="h-full rounded-full bg-expense" style={{ width: `${coverage}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              Para cubrir lo planificado cargás{" "}
              <span className="font-medium text-foreground tabular-nums">{formatCurrency(totals.charged)}</span> a la
              tarjeta. Comisiones registradas{" "}
              <span className="font-medium text-foreground tabular-nums">{formatCurrency(feesDone)}</span>, por
              registrar{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatCurrency(Math.round((totals.fees - feesDone) * 100) / 100)}
              </span>
              .
            </p>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          {operations.length === 1 ? "1 operación" : `${operations.length} operaciones`}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <RouletteOperationDialog
            scheduledPaymentId={entry.scheduledPaymentId}
            dueDateValue={entry.dueDateValue}
            providers={providers}
            defaultDate={toUTCDateInputValue(today)}
          />
          {registrable.length > 0 && (
            <RegisterRouletteDialog
              bulk
              action={registerDueRouletteOperations.bind(null, entry.scheduledPaymentId, entry.dueDateValue)}
              description={
                registrable.length === 1
                  ? "1 operación con fecha hasta hoy."
                  : `${registrable.length} operaciones con fecha hasta hoy.`
              }
              fees={summarizeRoulette(registrable).fees}
              accounts={accounts}
              categories={categories}
              defaultAccountId={entry.accountId}
              defaultCategoryId={commissionCategoryId}
            />
          )}
          <RoulettePlanDialog
            scheduledPaymentId={entry.scheduledPaymentId}
            dueDateValue={entry.dueDateValue}
            defaultNet={remaining}
            defaultStart={toUTCDateInputValue(today)}
            defaultEnd={toUTCDateInputValue(planEnd)}
            providers={providers}
          />
        </div>
      </div>

      {operations.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sin ruleteo planificado</CardTitle>
            <CardDescription>
              Generá las operaciones para cubrir la deuda: cuánto necesitás recibir, el proveedor con su comisión y el
              máximo que podés cargar por vez. Aparecen en el calendario en su fecha.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <ul>
              {operations.map((operation) => (
                <OperationRow
                  key={operation.id}
                  operation={operation}
                  dueDateValue={entry.dueDateValue}
                  providers={providers}
                  accounts={accounts}
                  categories={categories}
                  defaultAccountId={entry.accountId}
                  defaultCategoryId={commissionCategoryId}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OperationRow({
  operation,
  dueDateValue,
  providers,
  accounts,
  categories,
  defaultAccountId,
  defaultCategoryId,
}: {
  operation: RouletteOperationRow;
  dueDateValue: string;
  providers: { name: string; feeRate: number }[];
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  defaultAccountId: string | null;
  defaultCategoryId: string | null;
}) {
  const done = operation.status === "DONE";

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2.5 first:border-t-0">
      <OccurrenceStatusMark status={ROULETTE_MARK[operation.status]} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {formatDate(operation.date)} · {operation.provider}
        </p>
        <p className={cn("truncate text-xs text-muted-foreground", operation.status === "DUE" && "text-destructive")}>
          {ROULETTE_STATUS_LABELS[operation.status]} · cargo {formatCurrency(operation.charge)} → llegan{" "}
          {formatCurrency(operation.received)}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span className="text-sm font-semibold text-expense tabular-nums">{formatCurrency(operation.fee)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{formatPercent(operation.feeRate)}</span>
      </div>

      <div className="flex basis-full items-center justify-end gap-1 sm:w-48 sm:basis-auto">
        {done ? (
          <UndoRouletteButton operationId={operation.id} />
        ) : (
          <>
            {operation.fee > 0 && (
              <RegisterRouletteDialog
                action={registerRouletteOperation.bind(null, operation.id)}
                description={`${operation.provider} · ${formatDate(operation.date)} · cargo ${formatCurrency(operation.charge)}`}
                fees={operation.fee}
                accounts={accounts}
                categories={categories}
                defaultAccountId={defaultAccountId}
                defaultCategoryId={defaultCategoryId}
              />
            )}
            <RouletteOperationDialog
              scheduledPaymentId={operation.scheduledPaymentId}
              dueDateValue={dueDateValue}
              providers={providers}
              defaultDate={toUTCDateInputValue(operation.date)}
              operation={{
                id: operation.id,
                date: toUTCDateInputValue(operation.date),
                provider: operation.provider,
                feeRate: operation.feeRate,
                charge: operation.charge,
              }}
            />
          </>
        )}
        <ConfirmDeleteButton
          title="¿Eliminar esta operación?"
          description={
            done
              ? "Se quita del plan y también se borra el gasto de su comisión en Transacciones."
              : "Se quita del plan de ruleteo."
          }
          onConfirm={deleteRouletteOperation.bind(null, operation.id)}
        />
      </div>
    </li>
  );
}
