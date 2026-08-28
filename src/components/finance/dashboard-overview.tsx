"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryPieChart } from "@/components/finance/category-pie-chart";
import { PeriodRangeFilter, type PeriodSelection } from "@/components/finance/period-range-filter";
import { getDashboardSummaryForRangeAction } from "@/features/dashboard/actions";
import { getPresetRange } from "@/lib/period";
import { monthRange, toDateInputValue } from "@/lib/date";
import { formatCurrency, formatDate } from "@/lib/format";
import type { TransactionKind } from "@/generated/prisma/client";

type CategoryTotal = { name: string; total: number };
type TransactionRow = {
  id: string;
  date: Date;
  description: string | null;
  amount: number;
  kind: TransactionKind;
  categoryName: string;
  accountName: string;
};
type Summary = {
  balance: number;
  income: number;
  expense: number;
  expenseByCategory: CategoryTotal[];
  transactions: TransactionRow[];
};

export function DashboardOverview({
  initialSummary,
  initialYear,
  initialMonth,
}: {
  initialSummary: Summary;
  initialYear: number;
  initialMonth: number;
}) {
  const [selection, setSelection] = useState<PeriodSelection>({
    preset: "thisMonth",
    customStart: toDateInputValue(monthRange(initialYear, initialMonth).start),
    customEnd: toDateInputValue(new Date()),
  });
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [isPending, startTransition] = useTransition();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const range = getPresetRange(selection.preset, selection.customStart, selection.customEnd);
    if (!range) return;
    startTransition(async () => {
      const result = await getDashboardSummaryForRangeAction(range.start.toISOString(), range.end.toISOString());
      setSummary(result);
    });
  }, [selection]);

  return (
    <div className={`flex flex-col gap-4 transition-opacity ${isPending ? "opacity-60" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl font-medium italic md:text-3xl">Resumen</h1>
        <PeriodRangeFilter value={selection} onApply={setSelection} />
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
                      <p className="truncate text-sm font-medium">{t.description || t.categoryName}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.categoryName} · {formatDate(t.date)}
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
