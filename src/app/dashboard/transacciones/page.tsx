import Link from "next/link";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ReceiptsDialog } from "@/components/finance/receipts-dialog";
import { AccountFilter } from "@/components/finance/account-filter";
import { PaymentMethodFilter } from "@/components/finance/payment-method-filter";
import { TransactionFormDialog } from "@/components/finance/transaction-form-dialog";
import { getAccounts } from "@/features/accounts/queries";
import { getCategories, getFrequentCategoryIds, getReasonSuggestions } from "@/features/categories/queries";
import { deleteTransaction } from "@/features/transactions/actions";
import { getTransactionsForMonth, type PaymentMethodFilter as MethodFilter } from "@/features/transactions/queries";
import { parseMonthParam, toUTCDateInputValue } from "@/lib/date";
import { formatCurrency, formatTransactionDateTime } from "@/lib/format";
import { isPaymentMethod, NO_PAYMENT_METHOD_LABEL, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { IMPORT_SOURCES, isImportSource } from "@/lib/imports/sources";
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
  searchParams: Promise<{ month?: string; method?: string; account?: string }>;
}) {
  const { month: monthParam, method: methodParam, account: accountParam } = await searchParams;
  const { year, month } = parseMonthParam(monthParam);
  const method = parseMethodParam(methodParam);

  const accounts = await getAccounts();
  // Solo una cuenta propia: un id ajeno o viejo en la URL se ignora.
  const account = accounts.find((a) => a.id === accountParam) ?? null;

  const [transactions, incomeCategories, expenseCategories, reasonSuggestions, frequentCategoryIds] =
    await Promise.all([
      getTransactionsForMonth(year, month, method ?? undefined, account?.id),
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
          <AccountFilter accounts={accounts} value={account?.id ?? null} />
          <PaymentMethodFilter value={method} />
          <Button variant="outline" asChild>
            <Link href="/dashboard/importaciones">
              <FileUp />
              Importar
            </Link>
          </Button>
          <TransactionFormDialog
            accounts={accounts}
            incomeCategories={incomeCategories}
            expenseCategories={expenseCategories}
            frequentCategoryIds={frequentCategoryIds}
            reasonSuggestions={reasonSuggestions}
          />
        </div>
      </div>

      {account && !method && transactions.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {account.name} este mes: ingresos{" "}
          <span className="font-medium text-income tabular-nums">
            {formatCurrency(transactions.filter((t) => t.kind === "INCOME").reduce((sum, t) => sum + t.amount, 0))}
          </span>{" "}
          · gastos{" "}
          <span className="font-medium text-expense tabular-nums">
            {formatCurrency(transactions.filter((t) => t.kind === "EXPENSE").reduce((sum, t) => sum + t.amount, 0))}
          </span>
        </p>
      )}

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
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                {method
                  ? "No hay gastos con este método de pago en este mes."
                  : account
                    ? `No hay transacciones de ${account.name} en este mes.`
                    : "No hay transacciones en este mes."}
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
                    {t.imports.map((item) => (
                      <Link
                        key={item.importId}
                        href={`/dashboard/importaciones/${item.importId}?estado=aplicados`}
                        className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        <FileUp className="size-3 shrink-0" />
                        {item.created ? "importado de" : "vinculado a"}{" "}
                        {isImportSource(item.source) ? IMPORT_SOURCES[item.source].label : item.source}
                      </Link>
                    ))}
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
                      <ReceiptsDialog urls={t.receiptUrls} title={t.reason ?? t.description ?? undefined} />
                      <EditTransactionDialog
                        transactionId={t.id}
                        kind={t.kind}
                        currentDate={toUTCDateInputValue(t.date)}
                        currentCategoryId={t.categoryId}
                        currentPaymentMethod={t.paymentMethod}
                        currentReason={t.reason}
                        currentDescription={t.description}
                        currentReceiptUrls={t.receiptUrls}
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
