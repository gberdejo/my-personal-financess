import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

export async function getBudgets() {
  const userId = await requireUserId();

  const budgets = await prisma.budget.findMany({
    where: { userId },
    include: {
      items: { select: { amount: true, transaction: { select: { amount: true } } } },
    },
    orderBy: [{ date: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });

  return budgets.map((budget) => {
    const planned = budget.items.reduce((sum, item) => sum + Number(item.amount), 0);
    const applied = budget.items.reduce((sum, item) => sum + Number(item.transaction?.amount ?? 0), 0);
    return {
      id: budget.id,
      title: budget.title,
      date: budget.date,
      template: budget.template,
      itemCount: budget.items.length,
      planned,
      applied,
    };
  });
}

export async function getBudget(budgetId: string) {
  const userId = await requireUserId();

  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, userId },
    include: {
      items: {
        include: {
          category: { select: { id: true, name: true } },
          transaction: { select: { id: true, amount: true, date: true, account: { select: { name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!budget) return null;

  const items = budget.items.map((item) => ({
    id: item.id,
    description: item.description,
    categoryId: item.category.id,
    categoryName: item.category.name,
    quantity: item.quantity === null ? null : Number(item.quantity),
    unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
    amount: Number(item.amount),
    applied: item.transaction
      ? {
          transactionId: item.transaction.id,
          amount: Number(item.transaction.amount),
          date: item.transaction.date,
          accountName: item.transaction.account.name,
        }
      : null,
  }));

  return {
    id: budget.id,
    title: budget.title,
    description: budget.description,
    date: budget.date,
    template: budget.template,
    accountId: budget.accountId,
    items,
  };
}

export type BudgetDetail = NonNullable<Awaited<ReturnType<typeof getBudget>>>;
export type BudgetItemRow = BudgetDetail["items"][number];
