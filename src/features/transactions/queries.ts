import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { toUTCDateInputValue } from "@/lib/date";
import { amountLockInfo } from "@/lib/transaction-lock";
import { chargeStatuses } from "@/features/cards/charges";
import type { PaymentMethod } from "@/generated/prisma/client";

// "NONE" son los gastos sin método de pago (registrados antes de existir el campo).
export type PaymentMethodFilter = PaymentMethod | "NONE";
// Id de una tarjeta de crédito.
export type CardFilter = string;

// Transacciones en [start, end), opcionalmente de un método de pago (y, con
// tarjeta de crédito, de una tarjeta) o una cuenta.
export async function getTransactionsForRange(
  start: Date,
  end: Date,
  method?: PaymentMethodFilter,
  accountId?: string,
  card?: CardFilter
) {
  const userId = await requireUserId();

  // Filtrar por método solo tiene sentido en gastos: los ingresos quedan fuera.
  const methodWhere = card
    ? { kind: "EXPENSE" as const, paymentMethod: "CREDIT_CARD" as const, cardId: card }
    : method
      ? { kind: "EXPENSE" as const, paymentMethod: method === "NONE" ? null : method }
      : {};

  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: start, lt: end }, ...methodWhere, ...(accountId ? { accountId } : {}) },
    include: {
      account: true,
      category: true,
      card: { select: { name: true } },
      budgetItem: { select: { budget: { select: { id: true, title: true } } } },
      loanPrepayment: { select: { scheduledPaymentId: true } },
      // Si es el pago de una tarjeta, el periodo que pagó.
      scheduledOccurrence: { select: { scheduledPaymentId: true, dueDate: true } },
      usdScheduledOccurrence: { select: { scheduledPaymentId: true, dueDate: true } },
      importedMovements: {
        select: { importId: true, createdTransaction: true, import: { select: { source: true } } },
        orderBy: { occurredAt: "asc" },
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  // Consumos con tarjeta (sin cuenta): pendientes o pagados según su periodo.
  const statuses = await chargeStatuses(transactions.filter((t) => t.kind === "EXPENSE" && t.accountId === null));

  return transactions.map((t) => ({
    id: t.id,
    date: t.date,
    createdAt: t.createdAt,
    reason: t.reason,
    description: t.description,
    amount: Number(t.amount),
    // Consumos y pagos en dólares: `amount` sigue en soles (estimado si aún no hay tipo de cambio).
    currency: t.currency,
    foreignAmount: t.foreignAmount === null ? null : Number(t.foreignAmount),
    exchangeRate: t.exchangeRate === null ? null : Number(t.exchangeRate),
    kind: t.kind,
    paymentMethod: t.paymentMethod,
    cardId: t.cardId,
    cardName: t.card?.name ?? null,
    accountId: t.accountId,
    accountName: t.account?.name ?? null,
    categoryId: t.categoryId,
    categoryName: t.category.name,
    budget: t.budgetItem?.budget ?? null,
    receiptUrls: t.receiptUrls,
    amountLock: amountLockInfo(t),
    // Importaciones de donde viene (o a las que se vinculó) esta transacción.
    charge:
      t.kind === "EXPENSE" && t.accountId === null && t.cardId
        ? {
            status: statuses.get(t.id)?.status ?? "PENDING",
            href: `/dashboard/tarjetas/${t.cardId}${statuses.get(t.id) ? `?ciclo=${statuses.get(t.id)!.cycleKey}` : ""}`,
          }
        : null,
    // Pago de tarjeta: lleva al periodo que pagó.
    cardPaymentHref: (() => {
      const occurrence = t.scheduledOccurrence ?? t.usdScheduledOccurrence;
      return t.kind === "CARD_PAYMENT" && occurrence
        ? `/dashboard/tarjetas/${occurrence.scheduledPaymentId}?pago=${toUTCDateInputValue(occurrence.dueDate)}`
        : null;
    })(),
    // Pago en dólares: se puede editar su monto y tipo de cambio.
    isUsdPayment: t.kind === "CARD_PAYMENT" && t.usdScheduledOccurrence !== null,
    imports: t.importedMovements.map((m) => ({
      importId: m.importId,
      source: m.import.source,
      created: m.createdTransaction,
    })),
  }));
}
