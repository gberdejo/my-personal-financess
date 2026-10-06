import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MonthNav } from "@/components/finance/month-nav";
import { ConfirmDeleteButton } from "@/components/finance/confirm-delete-button";
import { EditTransactionDialog } from "@/components/finance/edit-transaction-dialog";
import { PaymentMethodFilter } from "@/components/finance/payment-method-filter";
import { TransactionFormDialog } from "@/components/finance/transaction-form-dialog";
import { getAccounts } from "@/features/accounts/queries";
import { getCategories, getFrequentCategoryIds, getReasonSuggestions } from "@/features/categories/queries";
import { deleteTransaction } from "@/features/transactions/actions";
import { getTransactionsForMonth, type PaymentMethodFilter as MethodFilter } from "@/features/transactions/queries";
import { parseMonthParam, toUTCDateInputValue } from "@/lib/date";
import { formatCurrency, formatTransactionDateTime } from "@/lib/format";
import { isPaymentMethod, NO_PAYMENT_METHOD_LABEL, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { normalizeReason } from "@/lib/reason";

function parseMethodParam(raw: string | undefined): MethodFilter | null {
  if (!raw) return null;
  if (raw === "NONE" || isPaymentMethod(raw)) return raw;
  return null;
}

// Los movimientos anteriores al motivo lo heredaron de la descripción: no
// tiene sentido mostrar el mismo texto dos veces.
function extraDescription(reason: string | null, description: string | null) {
  if (!description) return null;
  if (reason && normalizeReason(reason) === normalizeReason(description)) return null;
  return description;
}

export default async function TransaccionesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; method?: string }>;
}) {
  const { month: monthParam, method: methodParam } = await searchParams;
  const { year, month } = parseMonthParam(monthParam);
  const method = parseMethodParam(methodParam);

  const [transactions, accounts, incomeCategories, expenseCategories, reasonSuggestions, frequentCategoryIds] =
    await Promise.all([
      getTransactionsForMonth(year, month, method ?? undefined),
      getAccounts(),
      getCategories("INCOME"),
      getCategories("EXPENSE"),
      getReasonSuggestions(),
      getFrequentCategoryIds(),
    ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl font-medium italic md:text-3xl">Transacciones</h1>
        <div className="flex flex-wrap items-center gap-2">
          <MonthNav year={year} month={month} />
          <PaymentMethodFilter value={method} />
          <TransactionFormDialog
            accounts={accounts}
            incomeCategories={incomeCategories}
            expenseCategories={expenseCategories}
            frequentCategoryIds={frequentCategoryIds}
            reasonSuggestions={reasonSuggestions}
          />
        </div>
      </div>

      {method && transactions.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {transactions.length === 1 ? "1 gasto" : `${transactions.length} gastos`}{" "}
          {method === "NONE" ? "sin método de pago" : `con ${PAYMENT_METHOD_LABELS[method]}`} este mes:{" "}
          <span className="font-medium text-expense tabular-nums">
            {formatCurrency(transactions.reduce((sum, t) => sum + t.amount, 0))}
          </span>
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead className="hidden sm:table-cell">Cuenta</TableHead>
            <TableHead className="hidden md:table-cell">Método</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                {method ? "No hay gastos con este método de pago en este mes." : "No hay transacciones en este mes."}
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((t) => {
              // Sin motivo, la descripción ocupa su lugar.
              const description = t.reason ? extraDescription(t.reason, t.description) : null;
              return (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatTransactionDateTime(t.date, t.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-40">
                    <p className="truncate">{t.reason ?? t.description ?? "—"}</p>
                    {description && (
                      <p className="truncate text-xs text-muted-foreground" title={description}>
                        {description}
                      </p>
                    )}
                    {t.budget && (
                      <Link
                        href={`/dashboard/presupuestos/${t.budget.id}`}
                        className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        de {t.budget.title}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell>
                    {t.categoryName}
                    {t.paymentMethod && (
                      <p className="text-xs text-muted-foreground md:hidden">{PAYMENT_METHOD_LABELS[t.paymentMethod]}</p>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{t.accountName}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {t.kind === "EXPENSE" ? (
                      t.paymentMethod ? (
                        PAYMENT_METHOD_LABELS[t.paymentMethod]
                      ) : (
                        <span className="text-muted-foreground">{NO_PAYMENT_METHOD_LABEL}</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums whitespace-nowrap ${
                      t.kind === "INCOME" ? "text-income" : "text-expense"
                    }`}
                  >
                    {t.kind === "INCOME" ? "+" : "-"}
                    {formatCurrency(t.amount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <EditTransactionDialog
                        transactionId={t.id}
                        kind={t.kind}
                        currentDate={toUTCDateInputValue(t.date)}
                        currentCategoryId={t.categoryId}
                        currentPaymentMethod={t.paymentMethod}
                        currentReason={t.reason}
                        currentDescription={t.description}
                        categories={t.kind === "INCOME" ? incomeCategories : expenseCategories}
                        frequentCategoryIds={frequentCategoryIds}
                        reasonSuggestions={reasonSuggestions}
                      />
                      <ConfirmDeleteButton
                        title="¿Eliminar este movimiento?"
                        description="Esta acción no se puede deshacer."
                        onConfirm={deleteTransaction.bind(null, t.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
