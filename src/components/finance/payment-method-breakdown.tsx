"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { NO_PAYMENT_METHOD_LABEL, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import type { PaymentMethod } from "@/generated/prisma/client";

type PaymentMethodTotal = { method: PaymentMethod | null; total: number };

export function PaymentMethodBreakdown({
  data,
  totalExpense,
}: {
  data: PaymentMethodTotal[];
  totalExpense: number;
}) {
  const share = (amount: number) => (totalExpense > 0 ? (amount / totalExpense) * 100 : 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos por método de pago</CardTitle>
        <CardDescription>Cómo pagaste lo que gastaste en el periodo</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay gastos registrados en este periodo.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.map((item) => {
              const label = item.method ? PAYMENT_METHOD_LABELS[item.method] : NO_PAYMENT_METHOD_LABEL;
              const percentage = share(item.total);
              return (
                <li key={item.method ?? "none"} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className={`truncate text-sm font-medium ${item.method ? "" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                    <div className="flex shrink-0 items-baseline gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">{percentage.toFixed(0)}%</span>
                      <span className="text-sm font-semibold tabular-nums text-expense">
                        {formatCurrency(item.total)}
                      </span>
                    </div>
                  </div>
                  <div
                    className="h-1 w-full overflow-hidden rounded-full bg-muted"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(percentage)}
                    aria-label={`${label}: ${percentage.toFixed(0)}% del gasto del periodo`}
                  >
                    <div
                      className={`h-full rounded-full ${item.method ? "bg-expense/70" : "bg-muted-foreground/40"}`}
                      style={{ width: `${Math.max(percentage, 1)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
