import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

export async function getAccountsWithBalance() {
  const userId = await requireUserId();

  const accounts = await prisma.account.findMany({
    where: { userId },
    include: { transactions: { select: { amount: true, kind: true } } },
    orderBy: { createdAt: "asc" },
  });

  return accounts.map((account) => {
    const delta = account.transactions.reduce((sum, t) => {
      const amount = Number(t.amount);
      return sum + (t.kind === "INCOME" ? amount : -amount);
    }, 0);

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      initialBalance: Number(account.initialBalance),
      balance: Number(account.initialBalance) + delta,
    };
  });
}

export async function getAccounts() {
  const userId = await requireUserId();
  return prisma.account.findMany({
    where: { userId },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
}
