"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryPieChart } from "@/components/finance/category-pie-chart";
import { PaymentMethodBreakdown } from "@/components/finance/payment-method-breakdown";
import { RecurringExpensesList } from "@/components/finance/recurring-expenses-list";
import { TopExpensesList } from "@/components/finance/top-expenses-list";
import { PeriodRangeFilter, type PeriodSelection } from "@/components/finance/period-range-filter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getDashboardSummaryForRangeAction } from "@/features/dashboard/actions";
import { getPresetRange } from "@/lib/period";
import { toDateInputValue } from "@/lib/date";
import { formatCurrency, formatTransactionDate } from "@/lib/format";
import type { PaymentMethod, TransactionKind } from "@/generated/prisma/client";

type CategoryTotal = { name: string; total: number };
type AccountOption = { id: string; name: string };

// Valor del selector para ver todas las cuentas juntas.
const ALL_ACCOUNTS = "ALL";
type PaymentMethodTotal = { method: PaymentMethod | null; total: number };
type TransactionRow = {
  id: string;
  date: Date;
  reason: string | null;
  amount: number;
  kind: TransactionKind;
  categoryName: string;
  accountName: string | null;
};
type Summary = {
  balance: number;
  income: number;
  expense: number;
  expenseByCategory: CategoryTotal[];
  expenseByPaymentMethod: PaymentMethodTotal[];
  transactions: TransactionRow[];
};

export function DashboardOverview({
  initialSummary,
  initialStart,
  initialAccountId,
  accounts,
}: {
  initialSummary: Summary;
  initialStart: string;
  initialAccountId: string | null;
  accounts: AccountOption[];
}) {
  const [draftSelection, setDraftSelection] = useState<PeriodSelection>(() => ({
    preset: "last7Days",
    customStart: initialStart,
    customEnd: toDateInputValue(new Date()),
  }));
  const [draftAccountId, setDraftAccountId] = useState(initialAccountId ?? ALL_ACCOUNTS);
  // Filtros con los que se trajo el resumen que se está mostrando.
  const [applied, setApplied] = useState(() => ({ selection: draftSelection, accountId: draftAccountId }));
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [isPending, startTransition] = useTransition();

  const hasChanges =
    draftAccountId !== applied.accountId ||
    draftSelection.preset !== applied.selection.preset ||
    draftSelection.customStart !== applied.selection.customStart ||
    draftSelection.customEnd !== applied.selection.customEnd;

  function handleSearch() {
    const range = getPresetRange(draftSelection.preset, draftSelection.customStart, draftSelection.customEnd);
    if (!range) return;
    const selection = draftSelection;
    const accountId = draftAccountId;
    startTransition(async () => {
      const result = await getDashboardSummaryForRangeAction(
        range.start.toISOString(),
        range.end.toISOString(),
        accountId === ALL_ACCOUNTS ? null : accountId
      );
      setSummary(result);
      setApplied({ selection, accountId });
    });
  }

  return (
    <div className={`flex flex-col gap-4 transition-opacity ${isPending ? "opacity-60" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl font-medium italic md:text-3xl">Resumen</h1>
        <div className="flex flex-col gap-1.5 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {accounts.length > 0 && (
              <Select value={draftAccountId} onValueChange={setDraftAccountId}>
                <SelectTrigger aria-label="Cuenta" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ACCOUNTS}>Todas las cuentas</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <PeriodRangeFilter value={draftSelection} onApply={setDraftSelection} applyLabel="Listo" />
            <Button onClick={handleSearch} disabled={isPending || !hasChanges}>
              <Search className="size-4" data-icon="inline-start" />
              {isPending ? "Buscando…" : "Buscar"}
            </Button>
          </div>
          {hasChanges && !isPending && (
            <p className="text-xs text-muted-foreground">Presiona Buscar para actualizar el resumen.</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Balance del periodo</CardDescription>
            <CardTitle className={`font-sans text-2xl not-italic font-semibold tabular-nums ${summary.balance < 0 ? "text-expense" : ""}`}>
              {formatCurrency(summary.balance)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Ingresos</CardDescription>
            <CardTitle className="font-sans text-2xl not-italic font-semibold tabular-nums text-income">
              {formatCurrency(summary.income)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Gastos</CardDescription>
            <CardTitle className="font-sans text-2xl not-italic font-semibold tabular-nums text-expense">
              {formatCurrency(summary.expense)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryPieChart data={summary.expenseByCategory} />

        <PaymentMethodBreakdown data={summary.expenseByPaymentMethod} totalExpense={summary.expense} />

        <TopExpensesList transactions={summary.transactions} totalExpense={summary.expense} />

        <RecurringExpensesList transactions={summary.transactions} />

        <Card>
          <CardHeader>
            <CardTitle>Transacciones del periodo</CardTitle>
            <CardDescription>
              <Link href="/dashboard/transacciones" className="hover:underline">
                Ver todas
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay transacciones en este periodo.</p>
            ) : (
              <div className="flex max-h-96 flex-col divide-y overflow-y-auto">
                {summary.transactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.reason || t.categoryName}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.categoryName} · {formatTransactionDate(t.date)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-medium tabular-nums ${
                        t.kind === "INCOME" ? "text-income" : "text-expense"
                      }`}
                    >
                      {t.kind === "INCOME" ? "+" : "-"}
                      {formatCurrency(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
