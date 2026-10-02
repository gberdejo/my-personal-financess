import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetFormDialog } from "@/components/finance/budget-form-dialog";
import { BudgetProgress } from "@/components/finance/budget-progress";
import { getAccounts } from "@/features/accounts/queries";
import { getBudgets } from "@/features/budgets/queries";
import { daysUntil } from "@/lib/date";
import { formatCountdown, formatTransactionDate } from "@/lib/format";
import { BUDGET_TEMPLATE_LABELS } from "@/lib/labels";

export default async function PresupuestosPage() {
  const [budgets, accounts] = await Promise.all([getBudgets(), getAccounts()]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-medium italic md:text-3xl">Presupuestos</h1>
        <BudgetFormDialog accounts={accounts} />
      </div>

      {budgets.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sin presupuestos todavía</CardTitle>
            <CardDescription>
              Creá un presupuesto para una fiesta, una obra o unas compras y anotá los gastos que vas a tener. Cuando
              los pagues, los aplicás y pasan a ser gastos reales.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {budgets.map((budget) => {
            const days = budget.date ? daysUntil(budget.date) : null;
            return (
              <Link
                key={budget.id}
                href={`/dashboard/presupuestos/${budget.id}`}
                className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Card className="h-full transition-colors group-hover:bg-muted/40">
                  <div className="flex flex-col gap-4 px-(--card-spacing)">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {BUDGET_TEMPLATE_LABELS[budget.template]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {budget.date ? formatTransactionDate(budget.date) : "Sin fecha"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <p className="truncate font-medium">{budget.title}</p>
                      <p
                        className={`font-heading text-base italic ${
                          days === null || days < 0 ? "text-muted-foreground" : ""
                        }`}
                      >
                        {days === null ? `${budget.itemCount} gastos planificados` : formatCountdown(days)}
                      </p>
                    </div>
                    <BudgetProgress planned={budget.planned} applied={budget.applied} />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
