import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

export async function getDashboardSummaryForRange(start: Date, end: Date) {
  const userId = await requireUserId();

  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: start, lt: end } },
    include: { category: true, account: true },
    orderBy: { date: "desc" },
  });

  const income = transactions
    .filter((t) => t.kind === "INCOME")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expense = transactions
    .filter((t) => t.kind === "EXPENSE")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const byCategory = new Map<string, { name: string; total: number }>();
  for (const t of transactions) {
    if (t.kind !== "EXPENSE") continue;
    const prev = byCategory.get(t.categoryId) ?? { name: t.category.name, total: 0 };
    prev.total += Number(t.amount);
    byCategory.set(t.categoryId, prev);
  }
  const expenseByCategory = [...byCategory.values()].sort((a, b) => b.total - a.total);

  return {
    balance: income - expense,
    income,
    expense,
    expenseByCategory,
    transactions: transactions.map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: Number(t.amount),
      kind: t.kind,
      categoryName: t.category.name,
      accountName: t.account.name,
    })),
  };
}
