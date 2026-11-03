import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { monthRange } from "@/lib/date";
import type { PaymentMethod } from "@/generated/prisma/client";

// "NONE" son los gastos sin método de pago (registrados antes de existir el campo).
export type PaymentMethodFilter = PaymentMethod | "NONE";

export async function getTransactionsForMonth(
  year: number,
  month: number,
  method?: PaymentMethodFilter,
  accountId?: string
) {
  const userId = await requireUserId();
  const { start, end } = monthRange(year, month);

  // Filtrar por método solo tiene sentido en gastos: los ingresos quedan fuera.
  const methodWhere = method
    ? { kind: "EXPENSE" as const, paymentMethod: method === "NONE" ? null : method }
    : {};

  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: start, lt: end }, ...methodWhere, ...(accountId ? { accountId } : {}) },
    include: {
      account: true,
      category: true,
      budgetItem: { select: { budget: { select: { id: true, title: true } } } },
      importedMovements: {
        select: { importId: true, createdTransaction: true, import: { select: { source: true } } },
        orderBy: { occurredAt: "asc" },
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return transactions.map((t) => ({
    id: t.id,
    date: t.date,
    createdAt: t.createdAt,
    reason: t.reason,
    description: t.description,
    amount: Number(t.amount),
    kind: t.kind,
    paymentMethod: t.paymentMethod,
    accountId: t.accountId,
    accountName: t.account.name,
    categoryId: t.categoryId,
    categoryName: t.category.name,
    budget: t.budgetItem?.budget ?? null,
    receiptUrls: t.receiptUrls,
    // Importaciones de donde viene (o a las que se vinculó) esta transacción.
    imports: t.importedMovements.map((m) => ({
      importId: m.importId,
      source: m.import.source,
      created: m.createdTransaction,
    })),
  }));
}
