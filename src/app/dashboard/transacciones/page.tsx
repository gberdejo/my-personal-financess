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
import { TransactionFormDialog } from "@/components/finance/transaction-form-dialog";
import { getAccounts } from "@/features/accounts/queries";
import { getCategories } from "@/features/categories/queries";
import { deleteTransaction } from "@/features/transactions/actions";
import { getTransactionsForMonth } from "@/features/transactions/queries";
import { parseMonthParam, toUTCDateInputValue } from "@/lib/date";
import { formatCurrency, formatTransactionDate } from "@/lib/format";

export default async function TransaccionesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const { year, month } = parseMonthParam(monthParam);

  const [transactions, accounts, incomeCategories, expenseCategories] = await Promise.all([
    getTransactionsForMonth(year, month),
    getAccounts(),
    getCategories("INCOME"),
    getCategories("EXPENSE"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl font-medium italic md:text-3xl">Transacciones</h1>
        <div className="flex flex-wrap items-center gap-2">
          <MonthNav year={year} month={month} />
          <TransactionFormDialog
            accounts={accounts}
            incomeCategories={incomeCategories}
            expenseCategories={expenseCategories}
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead className="hidden sm:table-cell">Cuenta</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No hay transacciones en este mes.
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="whitespace-nowrap">{formatTransactionDate(t.date)}</TableCell>
                <TableCell className="max-w-40 truncate">{t.description ?? "—"}</TableCell>
                <TableCell>{t.categoryName}</TableCell>
                <TableCell className="hidden sm:table-cell">{t.accountName}</TableCell>
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
                      currentDate={toUTCDateInputValue(t.date)}
                    />
                    <ConfirmDeleteButton
                      title="¿Eliminar este movimiento?"
                      description="Esta acción no se puede deshacer."
                      onConfirm={deleteTransaction.bind(null, t.id)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
