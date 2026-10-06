"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeReason } from "@/lib/reason";
import { formatCurrency } from "@/lib/format";
import type { TransactionKind } from "@/generated/prisma/client";

type TransactionRow = {
  id: string;
  date: Date;
  reason: string | null;
  amount: number;
  kind: TransactionKind;
  categoryName: string;
};

type RecurringExpense = {
  key: string;
  name: string;
  count: number;
  total: number;
  categories: Set<string>;
};

const DEFAULT_LIMIT = 5;
const MIN_OCCURRENCES = 2;
// A partir de aquí las marcas de conteo se resumen con "+n" para no desbordar la fila.
const MAX_TALLY_MARKS = 12;

export function RecurringExpensesList({
  transactions,
  limit = DEFAULT_LIMIT,
}: {
  transactions: TransactionRow[];
  limit?: number;
}) {
  const recurring = useMemo(() => {
    const byReason = new Map<string, RecurringExpense>();
    // Las transacciones llegan de la más reciente a la más antigua, así que el
    // nombre que se muestra es el de la última vez que se escribió.
    for (const t of transactions) {
      if (t.kind !== "EXPENSE" || !t.reason?.trim()) continue;
      const key = normalizeReason(t.reason);
      const entry = byReason.get(key) ?? {
        key,
        name: t.reason.trim(),
        count: 0,
        total: 0,
        categories: new Set<string>(),
      };
      entry.count += 1;
      entry.total += t.amount;
      entry.categories.add(t.categoryName);
      byReason.set(key, entry);
    }
    return [...byReason.values()]
      .filter((entry) => entry.count >= MIN_OCCURRENCES)
      .sort((a, b) => b.count - a.count || b.total - a.total);
  }, [transactions]);

  const shown = recurring.slice(0, limit);
  const recurringTotal = recurring.reduce((sum, entry) => sum + entry.total, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos recurrentes</CardTitle>
        <CardDescription>Lo que más se repite en el periodo, sin importar la categoría</CardDescription>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ningún gasto se repite en este periodo. Se agrupan por motivo: usá las sugerencias al registrar un gasto para que coincidan.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <ol className="flex flex-col gap-3">
              {shown.map((entry) => {
                const marks = Math.min(entry.count, MAX_TALLY_MARKS);
                const categoryLabel =
                  entry.categories.size === 1 ? [...entry.categories][0] : `${entry.categories.size} categorías`;
                return (
                  <li key={entry.key} className="flex items-start gap-3">
                    <span className="w-8 shrink-0 pt-0.5 text-right font-heading text-lg leading-none italic text-muted-foreground tabular-nums">
                      {entry.count}×
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="truncate text-sm font-medium">{entry.name}</p>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-expense">
                          {formatCurrency(entry.total)}
                        </span>
                      </div>
                      <div className="flex items-center gap-[3px]" aria-label={`Se repitió ${entry.count} veces`}>
                        {Array.from({ length: marks }, (_, i) => (
                          <span key={i} className="h-2.5 w-[3px] rounded-full bg-expense/70" />
                        ))}
                        {entry.count > MAX_TALLY_MARKS && (
                          <span className="ml-1 text-[10px] font-medium text-muted-foreground tabular-nums">
                            +{entry.count - MAX_TALLY_MARKS}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
                        <span className="truncate">{categoryLabel}</span>
                        <span className="shrink-0 tabular-nums">
                          promedio {formatCurrency(entry.total / entry.count)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            <p className="border-t pt-3 text-xs text-muted-foreground">
              {recurring.length === 1 ? "1 gasto se repite" : `${recurring.length} gastos se repiten`} y suman{" "}
              <span className="font-medium text-foreground tabular-nums">{formatCurrency(recurringTotal)}</span> en el
              periodo.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
