import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDeleteButton } from "@/components/finance/confirm-delete-button";
import { EditTransactionDialog } from "@/components/finance/edit-transaction-dialog";
import { ImportedMovementsTable } from "@/components/finance/imported-movements-table";
import { ReceiptsDialog } from "@/components/finance/receipts-dialog";
import { RestoreMovementButton, UnapplyMovementButton } from "@/components/finance/imported-movement-actions";
import { getAccounts } from "@/features/accounts/queries";
import {
  getCategories,
  getFrequentCategoryIds,
  getReasonSuggestions,
  type ReasonSuggestion,
} from "@/features/categories/queries";
import { deleteImport } from "@/features/imports/actions";
import { getImport, type ImportedMovementRow, type MovementStatus } from "@/features/imports/queries";
import { toUTCDateInputValue } from "@/lib/date";
import { formatCurrency, formatDate, formatLimaDateTime, formatLimaTime } from "@/lib/format";
import { IMPORT_SOURCES } from "@/lib/imports/sources";
import { MOVEMENT_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const TABS = [
  { param: "pendientes", status: "PENDING", label: "Pendientes" },
  { param: "aplicados", status: "APPLIED", label: "Aplicados" },
  { param: "descartados", status: "DISCARDED", label: "Descartados" },
  { param: "todos", status: null, label: "Todos" },
] as const satisfies readonly { param: string; status: MovementStatus | null; label: string }[];

export default async function ImportacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ estado?: string }>;
}) {
  const { id } = await params;
  const { estado } = await searchParams;
  const tab = TABS.find((t) => t.param === estado) ?? TABS[0];

  const [detail, accounts, incomeCategories, expenseCategories, frequentCategoryIds, reasonSuggestions] =
    await Promise.all([
      getImport(id),
      getAccounts(),
      getCategories("INCOME"),
      getCategories("EXPENSE"),
      getFrequentCategoryIds(),
      getReasonSuggestions(),
    ]);
  if (!detail) notFound();

  const { summary } = detail;
  const movements = tab.status ? detail.movements.filter((m) => m.status === tab.status) : detail.movements;
  const sourceLabel = summary.source ? IMPORT_SOURCES[summary.source].label : summary.rawSource;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/importaciones"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Importaciones
      </Link>

      <Card>
        <div className="flex items-start justify-between gap-4 px-(--card-spacing)">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">{sourceLabel}</span>
              <span>
                {summary.periodStart && summary.periodEnd
                  ? `Del ${formatDate(summary.periodStart)} al ${formatDate(summary.periodEnd)}`
                  : "Sin movimientos"}
                {summary.accountName && ` · ${summary.accountName}`} · importado el{" "}
                {formatLimaDateTime(summary.createdAt)}
              </span>
            </div>
            <h1 className="truncate font-heading text-2xl font-medium italic md:text-3xl">{summary.fileName}</h1>
            <p className="text-sm text-muted-foreground tabular-nums">
              {summary.total} movimientos: {summary.counts.APPLIED} aplicados, {summary.counts.PENDING} pendientes y{" "}
              {summary.counts.DISCARDED} descartados.
              {summary.skippedCount > 0 &&
                ` El archivo traía ${summary.skippedCount} ${summary.skippedCount === 1 ? "movimiento que ya estaba importado y se saltó" : "movimientos que ya estaban importados y se saltaron"}.`}
            </p>
          </div>
          <ConfirmDeleteButton
            title="¿Eliminar esta importación?"
            description="Se borran los movimientos cargados. Las transacciones que ya se aplicaron se quedan en Transacciones."
            onConfirm={deleteImport.bind(null, summary.id)}
          />
        </div>
      </Card>

      <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.param}
            href={`/dashboard/importaciones/${summary.id}?estado=${t.param}`}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              t.param === tab.param ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}{" "}
            <span className="text-xs text-muted-foreground tabular-nums">
              {t.status ? summary.counts[t.status] : summary.total}
            </span>
          </Link>
        ))}
      </nav>

      {movements.length === 0 ? (
        <p className="px-1 py-6 text-sm text-muted-foreground">
          {tab.status === "PENDING" ? "No quedan movimientos pendientes." : "No hay movimientos aquí."}
        </p>
      ) : tab.status === "PENDING" ? (
        <ImportedMovementsTable
          // Se reinicia la tabla cuando cambian los pendientes (al aplicar o descartar).
          key={movements.map((m) => m.id).join(",")}
          importId={summary.id}
          movements={movements}
          accounts={accounts}
          defaultAccountId={summary.accountId}
          incomeCategories={incomeCategories}
          expenseCategories={expenseCategories}
          frequentCategoryIds={frequentCategoryIds}
          reasonSuggestions={reasonSuggestions}
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <ul>
              {movements.map((m) => (
                <MovementLine
                  key={m.id}
                  movement={m}
                  importId={summary.id}
                  showStatus={tab.status === null}
                  categories={m.kind === "INCOME" ? incomeCategories : expenseCategories}
                  frequentCategoryIds={frequentCategoryIds}
                  reasonSuggestions={reasonSuggestions}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MovementLine({
  movement,
  importId,
  showStatus,
  categories,
  frequentCategoryIds,
  reasonSuggestions,
}: {
  movement: ImportedMovementRow;
  importId: string;
  showStatus: boolean;
  // Las del mismo tipo que el movimiento, para editar su transacción.
  categories: { id: string; name: string }[];
  frequentCategoryIds: string[];
  reasonSuggestions: Record<string, ReasonSuggestion[]>;
}) {
  const income = movement.kind === "INCOME";
  const { transaction } = movement;

  return (
    <li className="flex flex-col gap-2 border-t px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="hidden w-24 shrink-0 text-xs text-muted-foreground tabular-nums sm:block">
          <p>{formatDate(movement.date)}</p>
          <p>{formatLimaTime(movement.occurredAt)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {income ? "De " : "A "}
            {movement.counterparty ?? "—"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="sm:hidden">{formatDate(movement.date)} · </span>
            {transaction
              ? [
                  transaction.categoryName,
                  transaction.reason,
                  transaction.accountName,
                  transaction.created ? null : "vinculado",
                ]
                  .filter(Boolean)
                  .join(" · ")
              : (movement.message ?? "Sin mensaje")}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            movement.status === "DISCARDED" ? "text-muted-foreground line-through" : income ? "text-income" : "text-expense"
          )}
        >
          {income ? "+" : "−"}
          {formatCurrency(movement.amount)}
        </span>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1">
        {showStatus && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {MOVEMENT_STATUS_LABELS[movement.status]}
          </span>
        )}
        {transaction && (
          <>
            <Link
              href={`/dashboard/transacciones?month=${toUTCDateInputValue(transaction.date).slice(0, 7)}`}
              className="px-2 text-xs font-medium text-primary hover:underline"
            >
              Ver
            </Link>
            <ReceiptsDialog urls={transaction.receiptUrls} title={transaction.reason ?? undefined} />
            <EditTransactionDialog
              transactionId={transaction.id}
              kind={transaction.kind}
              currentDate={toUTCDateInputValue(transaction.date)}
              currentAmount={transaction.amount}
              amountLock={transaction.amountLock}
              currentCategoryId={transaction.categoryId}
              currentPaymentMethod={transaction.paymentMethod}
              currentReason={transaction.reason}
              currentDescription={transaction.description}
              currentReceiptUrls={transaction.receiptUrls}
              categories={categories}
              frequentCategoryIds={frequentCategoryIds}
              reasonSuggestions={reasonSuggestions}
            />
            <UnapplyMovementButton movementId={movement.id} created={transaction.created} />
          </>
        )}
        {movement.status === "DISCARDED" && <RestoreMovementButton importId={importId} movementId={movement.id} />}
      </div>
    </li>
  );
}
