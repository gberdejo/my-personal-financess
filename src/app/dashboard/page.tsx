import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardSummary } from "@/features/dashboard/queries";
import { monthLabel, parseMonthParam } from "@/lib/date";
import { formatCurrency, formatDate } from "@/lib/format";

export default async function DashboardPage() {
  const { year, month } = parseMonthParam();
  const summary = await getDashboardSummary(year, month);
  const maxCategoryTotal = summary.expenseByCategory[0]?.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Resumen</h1>
        <p className="text-sm text-muted-foreground">{monthLabel(year, month)}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Balance total</CardDescription>
            <CardTitle className={`text-2xl ${summary.balanceTotal < 0 ? "text-destructive" : ""}`}>
              {formatCurrency(summary.balanceTotal)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Ingresos del mes</CardDescription>
            <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">
              {formatCurrency(summary.income)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Gastos del mes</CardDescription>
            <CardTitle className="text-2xl text-destructive">{formatCurrency(summary.expense)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoría</CardTitle>
            <CardDescription>Este mes</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.expenseByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no registraste gastos este mes.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {summary.expenseByCategory.map((category) => (
                  <div key={category.name} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{category.name}</span>
                      <span className="font-medium">{formatCurrency(category.total)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${maxCategoryTotal > 0 ? (category.total / maxCategoryTotal) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimas transacciones</CardTitle>
            <CardDescription>
              <Link href="/dashboard/transacciones" className="hover:underline">
                Ver todas
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.recentTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay transacciones.</p>
            ) : (
              <div className="flex flex-col divide-y">
                {summary.recentTransactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.description || t.categoryName}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.categoryName} · {formatDate(t.date)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-medium ${
                        t.kind === "INCOME" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
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
