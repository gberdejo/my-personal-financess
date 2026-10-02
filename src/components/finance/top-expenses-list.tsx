"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatTransactionDate } from "@/lib/format";
import type { TransactionKind } from "@/generated/prisma/client";

type TransactionRow = {
  id: string;
  date: Date;
  description: string | null;
  amount: number;
  kind: TransactionKind;
  categoryName: string;
  accountName: string;
};

const DEFAULT_LIMIT = 5;

export function TopExpensesList({
  transactions,
  totalExpense,
  limit = DEFAULT_LIMIT,
}: {
  transactions: TransactionRow[];
  totalExpense: number;
  limit?: number;
}) {
  const topExpenses = useMemo(
    () =>
      transactions
        .filter((t) => t.kind === "EXPENSE")
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit),
    [transactions, limit],
  );

  const topTotal = topExpenses.reduce((sum, t) => sum + t.amount, 0);
  const share = (amount: number) => (totalExpense > 0 ? (amount / totalExpense) * 100 : 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos más altos</CardTitle>
        <CardDescription>Los movimientos que más pesaron en el periodo</CardDescription>
      </CardHeader>
      <CardContent>
        {topExpenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay gastos registrados en este periodo.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <ol className="flex flex-col gap-3">
              {topExpenses.map((t, index) => {
                const percentage = share(t.amount);
                return (
                  <li key={t.id} className="flex items-start gap-3">
                    <span className="w-5 shrink-0 pt-0.5 text-right font-heading text-lg leading-none italic text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="truncate text-sm font-medium">{t.description || t.categoryName}</p>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-expense">
                          {formatCurrency(t.amount)}
                        </span>
                      </div>
                      <div
                        className="h-1 w-full overflow-hidden rounded-full bg-muted"
                        role="meter"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(percentage)}
                        aria-label={`${percentage.toFixed(0)}% del gasto del periodo`}
                      >
                        <div
                          className="h-full rounded-full bg-expense/70"
                          style={{ width: `${Math.max(percentage, 1)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
                        <span className="truncate">
                          {t.categoryName} · {formatTransactionDate(t.date)}
                        </span>
                        <span className="shrink-0 tabular-nums">{percentage.toFixed(0)}%</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            <p className="border-t pt-3 text-xs text-muted-foreground">
              {topExpenses.length === 1 ? "Este gasto suma " : `Estos ${topExpenses.length} gastos suman `}
              <span className="font-medium text-foreground tabular-nums">{formatCurrency(topTotal)}</span>, el{" "}
              <span className="font-medium text-foreground tabular-nums">{share(topTotal).toFixed(0)}%</span> de lo
              que gastaste en el periodo.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
