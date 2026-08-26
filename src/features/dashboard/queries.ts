import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { monthRange } from "@/lib/date";

export async function getDashboardSummary(year: number, month: number) {
  const userId = await requireUserId();
  const { start, end } = monthRange(year, month);

  const [accounts, monthTransactions, recentTransactions] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      include: { transactions: { select: { amount: true, kind: true } } },
    }),
    prisma.transaction.findMany({
      where: { userId, date: { gte: start, lt: end } },
      include: { category: true },
    }),
    prisma.transaction.findMany({
      where: { userId },
      include: { category: true, account: true },
      orderBy: { date: "desc" },
      take: 5,
    }),
  ]);

  const balanceTotal = accounts.reduce((sum, account) => {
    const delta = account.transactions.reduce((s, t) => {
      const amount = Number(t.amount);
      return s + (t.kind === "INCOME" ? amount : -amount);
    }, 0);
    return sum + Number(account.initialBalance) + delta;
  }, 0);

  const income = monthTransactions
    .filter((t) => t.kind === "INCOME")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expense = monthTransactions
    .filter((t) => t.kind === "EXPENSE")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const byCategory = new Map<string, { name: string; total: number }>();
  for (const t of monthTransactions) {
    if (t.kind !== "EXPENSE") continue;
    const prev = byCategory.get(t.categoryId) ?? { name: t.category.name, total: 0 };
    prev.total += Number(t.amount);
    byCategory.set(t.categoryId, prev);
  }
  const expenseByCategory = [...byCategory.values()].sort((a, b) => b.total - a.total);

  return {
    accountsCount: accounts.length,
    balanceTotal,
    income,
    expense,
    expenseByCategory,
    recentTransactions: recentTransactions.map((t) => ({
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
