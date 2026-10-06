import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { monthRange } from "@/lib/date";
import type { PaymentMethod } from "@/generated/prisma/client";

// "NONE" son los gastos sin método de pago (registrados antes de existir el campo).
export type PaymentMethodFilter = PaymentMethod | "NONE";

export async function getTransactionsForMonth(year: number, month: number, method?: PaymentMethodFilter) {
  const userId = await requireUserId();
  const { start, end } = monthRange(year, month);

  // Filtrar por método solo tiene sentido en gastos: los ingresos quedan fuera.
  const methodWhere = method
    ? { kind: "EXPENSE" as const, paymentMethod: method === "NONE" ? null : method }
    : {};

  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: start, lt: end }, ...methodWhere },
    include: {
      account: true,
      category: true,
      budgetItem: { select: { budget: { select: { id: true, title: true } } } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return transactions.map((t) => ({
    id: t.id,
    date: t.date,
    createdAt: t.createdAt,
    description: t.description,
    amount: Number(t.amount),
    kind: t.kind,
    paymentMethod: t.paymentMethod,
    accountId: t.accountId,
    accountName: t.account.name,
    categoryId: t.categoryId,
    categoryName: t.category.name,
    budget: t.budgetItem?.budget ?? null,
  }));
}
