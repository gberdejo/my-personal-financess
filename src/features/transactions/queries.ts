import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { monthRange } from "@/lib/date";

export async function getTransactionsForMonth(year: number, month: number) {
  const userId = await requireUserId();
  const { start, end } = monthRange(year, month);

  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: start, lt: end } },
    include: { account: true, category: true },
    orderBy: { date: "desc" },
  });

  return transactions.map((t) => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount),
    kind: t.kind,
    accountId: t.accountId,
    accountName: t.account.name,
    categoryId: t.categoryId,
    categoryName: t.category.name,
  }));
}
