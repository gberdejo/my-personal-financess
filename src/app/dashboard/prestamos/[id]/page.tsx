import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDeleteButton } from "@/components/finance/confirm-delete-button";
import { LoanFormDialog } from "@/components/finance/loan-form-dialog";
import { LoanInfoDialog } from "@/components/finance/loan-info-dialog";
import { LoanInstallmentDialog } from "@/components/finance/loan-installment-dialog";
import { LoanProgress } from "@/components/finance/loan-progress";
import { OccurrenceDialog } from "@/components/finance/occurrence-dialog";
import { OccurrenceStatusMark, occurrenceAmountClass } from "@/components/finance/occurrence-row";
import { getAccounts } from "@/features/accounts/queries";
import { getCategories } from "@/features/categories/queries";
import { deleteLoan, deleteLoanInstallment } from "@/features/loans/actions";
import { getLoan, type LoanDetail } from "@/features/loans/queries";
import { shiftMonth, todayInLima, toUTCDateInputValue } from "@/lib/date";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = LoanDetail["rows"][number];

const STATUS_TEXT = { PENDING: "Pendiente", OVERDUE: "Vencida", PAID: "Pagada", SKIPPED: "Omitida" } as const;

function formatPercent(rate: number, digits = 2) {
  return `${(rate * 100).toLocaleString("es-PE", { maximumFractionDigits: digits })} %`;
}

function groupByYear(rows: Row[]) {
  const years = new Map<number, Row[]>();
  for (const row of rows) {
    const year = row.dueDate.getUTCFullYear();
    years.set(year, [...(years.get(year) ?? []), row]);
  }
  return [...years.entries()];
}

export default async function PrestamoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [loan, accounts, categories] = await Promise.all([getLoan(id), getAccounts(), getCategories("EXPENSE")]);
  if (!loan) notFound();

  const { summary, rows } = loan;
  const currentYear = todayInLima().getUTCFullYear();
  const resolved = rows.some((row) => row.status === "PAID" || row.status === "SKIPPED");
  const lastRow = rows.at(-1);
  const nextDefault = lastRow
    ? (() => {
        const { year, month } = shiftMonth(lastRow.dueDate.getUTCFullYear(), lastRow.dueDate.getUTCMonth() + 1, 1);
        return `${year}-${String(month).padStart(2, "0")}-${String(lastRow.dueDate.getUTCDate()).padStart(2, "0")}`;
      })()
    : toUTCDateInputValue(todayInLima());

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/prestamos"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Préstamos
      </Link>

      <Card>
        <div className="flex flex-col gap-5 px-(--card-spacing)">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
                  {summary.lender ?? "Préstamo"}
                </span>
                <span>
                  TEA {formatPercent(summary.tea)} · desembolso {formatDate(loan.params.disbursementDate)}
                  {loan.payment.categoryName && ` · ${loan.payment.categoryName}`}
                </span>
              </div>
              <h1 className="font-heading text-2xl font-medium italic md:text-3xl">{summary.name}</h1>
            </div>
            <div className="flex shrink-0 items-center">
              <LoanInfoDialog
                scheduledPaymentId={summary.id}
                active={summary.active}
                accounts={accounts}
                categories={categories}
                initial={{
                  name: summary.name,
                  lender: summary.lender ?? "",
                  categoryId: loan.payment.categoryId ?? "",
                  accountId: loan.payment.accountId,
                  paymentMethod: loan.payment.paymentMethod,
                }}
              />
              <ConfirmDeleteButton
                title="¿Eliminar este préstamo?"
                description="Se borran su cronograma y sus cuotas del calendario. Los gastos de las cuotas ya pagadas se conservan en Transacciones."
                onConfirm={deleteLoan.bind(null, summary.id)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Total a pagar" value={formatCurrency(summary.totalToPay)} />
            <Stat label="Pagado" value={formatCurrency(summary.paidSoFar)} className="text-expense" />
            <Stat label="Falta pagar" value={formatCurrency(summary.remainingToPay)} />
            <Stat label="Cuotas pagadas" value={`${summary.paidCount} de ${summary.installmentCount}`} />
          </div>

          <LoanProgress principal={summary.principal} balance={summary.balance} />

          <p className="text-xs text-muted-foreground">
            Además del capital de{" "}
            <span className="font-medium text-foreground tabular-nums">{formatCurrency(summary.principal)}</span> pagás{" "}
            <span className="font-medium text-foreground tabular-nums">{formatCurrency(summary.totalInterest)}</span> de
            intereses y{" "}
            <span className="font-medium text-foreground tabular-nums">{formatCurrency(summary.totalInsurance)}</span> de
            seguros y cargos.
          </p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Cronograma de cuotas</h2>
        <div className="flex flex-wrap items-center gap-2">
          <LoanInstallmentDialog scheduledPaymentId={summary.id} defaultDate={nextDefault} />
          <LoanFormDialog
            accounts={accounts}
            categories={categories}
            scheduledPaymentId={summary.id}
            disabledReason={resolved ? "Ya hay cuotas pagadas u omitidas: editalas una por una." : undefined}
            initialParams={{
              principal: String(loan.params.principal),
              teaPercent: String(Math.round(loan.params.tea * 1e6) / 1e4),
              installments: String(summary.installmentCount),
              disbursementDate: toUTCDateInputValue(loan.params.disbursementDate),
              firstDueDate: rows[0] ? toUTCDateInputValue(rows[0].dueDate) : "",
              fixedInstallment: loan.params.fixedInstallment != null ? String(loan.params.fixedInstallment) : "",
              lifeInsurancePercent: loan.params.lifeInsuranceRate
                ? String(Math.round(loan.params.lifeInsuranceRate * 1e8) / 1e6)
                : "",
              otherCharges: loan.params.otherCharges ? String(loan.params.otherCharges) : "",
              dateShift: loan.params.dateShift,
              dayBasis: loan.params.dayBasis === 365 ? "365" : "360",
            }}
          />
        </div>
      </div>

      <Card className="gap-0 py-0">
        <div className="hidden grid-cols-[2rem_6.5rem_1fr_1fr_1fr_1fr_1fr_8.5rem] gap-3 border-b px-4 py-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase md:grid">
          <span>N.º</span>
          <span>Fecha</span>
          <span className="text-right">Capital</span>
          <span className="text-right">Interés</span>
          <span className="text-right">Seguros</span>
          <span className="text-right">Cuota</span>
          <span className="text-right">Saldo</span>
          <span />
        </div>
        <CardContent className="px-0">
          {groupByYear(rows).map(([year, yearRows]) => (
            <details key={year} open={year === currentYear || year === currentYear + 1} className="group border-t first:border-t-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40">
                <span>{year}</span>
                <span className="tabular-nums">
                  {yearRows.length} cuotas · {formatCurrency(yearRows.reduce((sum, row) => sum + row.total, 0))}
                </span>
              </summary>
              <ul>
                {yearRows.map((row) => (
                  <InstallmentRow key={row.id} row={row} scheduledPaymentId={summary.id} accounts={accounts} />
                ))}
              </ul>
            </details>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-lg font-semibold tabular-nums md:text-xl", className)}>{value}</span>
    </div>
  );
}

function InstallmentRow({
  row,
  scheduledPaymentId,
  accounts,
}: {
  row: Row;
  scheduledPaymentId: string;
  accounts: { id: string; name: string }[];
}) {
  const paid = row.status === "PAID";
  const insurance = row.lifeInsurance + row.otherCharges;

  return (
    <li className="grid grid-cols-[2rem_1fr_auto] items-center gap-x-3 gap-y-1 border-t px-4 py-2 text-sm md:grid-cols-[2rem_6.5rem_1fr_1fr_1fr_1fr_1fr_8.5rem]">
      <span className="text-xs text-muted-foreground tabular-nums">{row.number}</span>
      <div className="flex items-center gap-2">
        <OccurrenceStatusMark status={row.status} className="size-4" />
        <span className="tabular-nums">{formatDate(row.dueDate)}</span>
      </div>
      <span className={cn("hidden text-right tabular-nums md:block", row.principal < 0 && "text-destructive")}>
        {formatCurrency(row.principal)}
      </span>
      <span className="hidden text-right text-muted-foreground tabular-nums md:block">{formatCurrency(row.interest)}</span>
      <span className="hidden text-right text-muted-foreground tabular-nums md:block">{formatCurrency(insurance)}</span>
      <span className={cn("text-right font-semibold", occurrenceAmountClass(row.status))}>
        {formatCurrency(row.paidAmount ?? row.total)}
      </span>
      <span className="hidden text-right text-muted-foreground tabular-nums md:block">{formatCurrency(row.balance)}</span>

      <div className="col-span-3 flex items-center justify-end gap-1 md:col-span-1">
        {row.entry && (
          <OccurrenceDialog entry={row.entry} accounts={accounts}>
            <Button variant={paid || row.status === "SKIPPED" ? "ghost" : "outline"} size="sm">
              {paid || row.status === "SKIPPED" ? STATUS_TEXT[row.status] : "Pagar"}
            </Button>
          </OccurrenceDialog>
        )}
        {!paid && (
          <>
            <LoanInstallmentDialog
              scheduledPaymentId={scheduledPaymentId}
              installment={{
                id: row.id,
                number: row.number,
                dueDate: toUTCDateInputValue(row.dueDate),
                principal: row.principal,
                interest: row.interest,
                lifeInsurance: row.lifeInsurance,
                otherCharges: row.otherCharges,
              }}
            />
            <ConfirmDeleteButton
              title={`¿Eliminar la cuota ${row.number}?`}
              description="Se quita del cronograma y se recalculan los saldos de las siguientes."
              onConfirm={deleteLoanInstallment.bind(null, scheduledPaymentId, row.id)}
            />
          </>
        )}
      </div>
    </li>
  );
}
