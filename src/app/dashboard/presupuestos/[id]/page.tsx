import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ApplyBudgetItemDialog } from "@/components/finance/apply-budget-item-dialog";
import { ApplyPendingBudgetDialog } from "@/components/finance/apply-pending-budget-dialog";
import { BudgetFormDialog } from "@/components/finance/budget-form-dialog";
import { BudgetItemDialog } from "@/components/finance/budget-item-dialog";
import { BudgetProgress } from "@/components/finance/budget-progress";
import { ConfirmDeleteButton } from "@/components/finance/confirm-delete-button";
import { UndoBudgetItemButton } from "@/components/finance/undo-budget-item-button";
import { getAccounts } from "@/features/accounts/queries";
import { deleteBudget, deleteBudgetItem } from "@/features/budgets/actions";
import { getBudget, type BudgetItemRow } from "@/features/budgets/queries";
import { getCategories } from "@/features/categories/queries";
import { daysUntil, toUTCDateInputValue } from "@/lib/date";
import { formatCountdown, formatCurrency, formatDate, formatTransactionDate } from "@/lib/format";
import { BUDGET_TEMPLATE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

function groupByCategory(items: BudgetItemRow[]) {
  const groups = new Map<string, { id: string; name: string; planned: number; items: BudgetItemRow[] }>();
  for (const item of items) {
    const group = groups.get(item.categoryId) ?? { id: item.categoryId, name: item.categoryName, planned: 0, items: [] };
    group.planned += item.amount;
    group.items.push(item);
    groups.set(item.categoryId, group);
  }
  return [...groups.values()];
}

export default async function PresupuestoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [budget, accounts, categories] = await Promise.all([getBudget(id), getAccounts(), getCategories("EXPENSE")]);
  if (!budget) notFound();

  const planned = budget.items.reduce((sum, item) => sum + item.amount, 0);
  const applied = budget.items.reduce((sum, item) => sum + (item.applied?.amount ?? 0), 0);
  const pendingItems = budget.items.filter((item) => !item.applied);
  const pendingTotal = pendingItems.reduce((sum, item) => sum + item.amount, 0);
  const applicable = pendingItems.filter((item) => item.amount > 0);
  const days = budget.date ? daysUntil(budget.date) : null;
  const groups = groupByCategory(budget.items);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/presupuestos"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Presupuestos
      </Link>

      <Card>
        <div className="flex flex-col gap-5 px-(--card-spacing)">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
                  {BUDGET_TEMPLATE_LABELS[budget.template]}
                </span>
                {budget.date ? (
                  <span>
                    {formatTransactionDate(budget.date)} · {formatCountdown(days!)}
                  </span>
                ) : (
                  <span>Sin fecha</span>
                )}
              </div>
              <h1 className="font-heading text-2xl font-medium italic md:text-3xl">{budget.title}</h1>
              {budget.description && <p className="text-sm text-muted-foreground">{budget.description}</p>}
            </div>
            <div className="flex shrink-0 items-center">
              <BudgetFormDialog
                accounts={accounts}
                budget={{
                  id: budget.id,
                  title: budget.title,
                  description: budget.description,
                  date: budget.date ? toUTCDateInputValue(budget.date) : "",
                  accountId: budget.accountId,
                }}
              />
              <ConfirmDeleteButton
                title="¿Eliminar este presupuesto?"
                description="Se borran sus gastos planificados. Los gastos ya aplicados se mantienen en Transacciones."
                onConfirm={deleteBudget.bind(null, budget.id)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Planificado</span>
              <span className="text-lg font-semibold tabular-nums md:text-xl">{formatCurrency(planned)}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Aplicado</span>
              <span className="text-lg font-semibold text-expense tabular-nums md:text-xl">
                {formatCurrency(applied)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Por aplicar</span>
              <span className="text-lg font-semibold tabular-nums md:text-xl">{formatCurrency(pendingTotal)}</span>
            </div>
          </div>

          <BudgetProgress planned={planned} applied={applied} />
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          {budget.items.length === 1 ? "1 gasto" : `${budget.items.length} gastos`} ·{" "}
          {pendingItems.length === 1 ? "1 pendiente" : `${pendingItems.length} pendientes`}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <BudgetItemDialog budgetId={budget.id} categories={categories} />
          <ApplyPendingBudgetDialog
            budgetId={budget.id}
            items={applicable}
            skippedCount={pendingItems.length - applicable.length}
            accounts={accounts}
            defaultAccountId={budget.accountId}
          />
        </div>
      </div>

      {budget.items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sin gastos planificados</CardTitle>
            <CardDescription>
              Agregá los gastos que esperás tener. No necesitan fecha: la fecha se pone cuando los aplicás.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            {groups.map((group) => (
              <div key={group.id} className="border-t first:border-t-0">
                <div className="flex items-center justify-between gap-4 px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                  <span>{group.name}</span>
                  <span className="tabular-nums">{formatCurrency(group.planned)}</span>
                </div>
                <ul>
                  {group.items.map((item) => (
                    <BudgetItemRowView
                      key={item.id}
                      item={item}
                      budgetId={budget.id}
                      categories={categories}
                      accounts={accounts}
                      defaultAccountId={budget.accountId}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BudgetItemRowView({
  item,
  budgetId,
  categories,
  accounts,
  defaultAccountId,
}: {
  item: BudgetItemRow;
  budgetId: string;
  categories: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  defaultAccountId: string | null;
}) {
  const applied = item.applied;
  const adjusted = applied && applied.amount !== item.amount;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <span
        aria-label={applied ? "Aplicado" : "Pendiente"}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full",
          applied ? "bg-expense text-background" : "border-[1.5px] border-dashed border-muted-foreground/50"
        )}
      >
        {applied && <Check className="size-3" strokeWidth={3} />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.description}</p>
        <p className="truncate text-xs text-muted-foreground">
          {applied
            ? `Aplicado el ${formatDate(applied.date)} · ${applied.accountName}`
            : item.quantity != null && item.unitPrice != null
              ? `${item.quantity} × ${formatCurrency(item.unitPrice)}`
              : item.amount > 0
                ? "Pendiente"
                : "Sin monto todavía"}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            applied ? "text-expense" : item.amount > 0 ? "" : "text-muted-foreground"
          )}
        >
          {formatCurrency(applied ? applied.amount : item.amount)}
        </span>
        {adjusted && (
          <span className="text-xs text-muted-foreground line-through tabular-nums">
            {formatCurrency(item.amount)}
          </span>
        )}
      </div>

      <div className="flex basis-full items-center justify-end gap-1 sm:w-40 sm:basis-auto">
        {applied ? (
          <UndoBudgetItemButton itemId={item.id} description={item.description} />
        ) : (
          <>
            <ApplyBudgetItemDialog item={item} accounts={accounts} defaultAccountId={defaultAccountId} />
            <BudgetItemDialog budgetId={budgetId} categories={categories} item={item} />
            <ConfirmDeleteButton
              title={`¿Eliminar “${item.description}”?`}
              description="Se quita del presupuesto. No afecta tus transacciones."
              onConfirm={deleteBudgetItem.bind(null, item.id)}
            />
          </>
        )}
      </div>
    </li>
  );
}
