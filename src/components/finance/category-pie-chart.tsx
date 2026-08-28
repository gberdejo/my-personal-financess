"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/format";

type CategoryTotal = { name: string; total: number };

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const chartConfig = { total: { label: "Total" } } satisfies ChartConfig;

export function CategoryPieChart({ data }: { data: CategoryTotal[] }) {
  const total = useMemo(() => data.reduce((sum, item) => sum + item.total, 0), [data]);
  const chartData = useMemo(
    () => data.map((item, index) => ({ ...item, fill: COLORS[index % COLORS.length] })),
    [data],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos por categoría</CardTitle>
        <CardDescription>Distribución del periodo seleccionado</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay gastos registrados en este periodo.</p>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-56 w-full sm:w-1/2">
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      nameKey="name"
                      formatter={(value, name) => (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-mono font-medium tabular-nums">
                            {formatCurrency(Number(value))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Pie data={chartData} dataKey="total" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2} strokeWidth={2}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>

            <div className="flex flex-1 flex-col gap-2">
              {data.map((item, index) => {
                const percentage = total > 0 ? (item.total / total) * 100 : 0;
                return (
                  <div key={item.name} className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="truncate">{item.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">{percentage.toFixed(0)}%</span>
                      <span className="font-medium tabular-nums">{formatCurrency(item.total)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
