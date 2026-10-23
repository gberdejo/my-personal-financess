import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { todayInLima, toUTCDateInputValue } from "@/lib/date";
import type { Prisma } from "@/generated/prisma/client";

// PLANNED: por hacer. DUE: su fecha ya pasó y no se registró. DONE: comisión registrada.
export type RouletteStatus = "PLANNED" | "DUE" | "DONE";

export type RouletteOperationRow = {
  id: string;
  scheduledPaymentId: string;
  cardName: string;
  // "YYYY-MM-DD" del vencimiento que cubre, para enlazar a su detalle.
  dueDateValue: string;
  date: Date;
  provider: string;
  // 0.02 = 2 %
  feeRate: number;
  charge: number;
  fee: number;
  received: number;
  status: RouletteStatus;
  transactionId: string | null;
};

const OPERATION_INCLUDE = { scheduledPayment: { select: { name: true } } } as const;

type LoadedOperation = Prisma.RouletteOperationGetPayload<{ include: typeof OPERATION_INCLUDE }>;

function toRow(op: LoadedOperation, today: Date): RouletteOperationRow {
  const charge = Number(op.charge);
  const fee = Number(op.fee);
  return {
    id: op.id,
    scheduledPaymentId: op.scheduledPaymentId,
    cardName: op.scheduledPayment.name,
    dueDateValue: toUTCDateInputValue(op.dueDate),
    date: op.date,
    provider: op.provider,
    feeRate: Number(op.feeRate),
    charge,
    fee,
    received: Math.round((charge - fee) * 100) / 100,
    status: op.transactionId ? "DONE" : op.date < today ? "DUE" : "PLANNED",
    transactionId: op.transactionId,
  };
}

// Ruleteos que cubren un vencimiento de tarjeta.
export async function getRouletteOperations(scheduledPaymentId: string, dueDate: Date) {
  const userId = await requireUserId();
  const today = todayInLima();

  const operations = await prisma.rouletteOperation.findMany({
    where: { userId, scheduledPaymentId, dueDate },
    include: OPERATION_INCLUDE,
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return operations.map((op) => toRow(op, today));
}

// Ruleteos que se hacen en [start, end), para la grilla del calendario.
export async function getRouletteOpsForRange(start: Date, end: Date) {
  const userId = await requireUserId();
  const today = todayInLima();

  const operations = await prisma.rouletteOperation.findMany({
    where: { userId, date: { gte: start, lt: end } },
    include: OPERATION_INCLUDE,
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return operations.map((op) => toRow(op, today));
}

export type RouletteProvider = { name: string; feeRate: number };

// Proveedores usados antes, con la última comisión, para sugerirlos.
export async function getRouletteProviders(): Promise<RouletteProvider[]> {
  const userId = await requireUserId();

  const operations = await prisma.rouletteOperation.findMany({
    where: { userId },
    select: { provider: true, feeRate: true },
    orderBy: { createdAt: "desc" },
    distinct: ["provider"],
  });
  return operations.map((op) => ({ name: op.provider, feeRate: Number(op.feeRate) }));
}

// Categoría propuesta para la comisión: la del último ruleteo registrado o,
// si no hay, "Otros gastos" (donde el seed pone el motivo "Comisión bancaria").
export async function getCommissionCategoryId() {
  const userId = await requireUserId();

  const last = await prisma.rouletteOperation.findFirst({
    where: { userId, transactionId: { not: null } },
    select: { transaction: { select: { categoryId: true } } },
    orderBy: { updatedAt: "desc" },
  });
  if (last?.transaction) return last.transaction.categoryId;

  const fallback = await prisma.category.findFirst({
    where: { name: "Otros gastos", kind: "EXPENSE", OR: [{ userId: null }, { userId }] },
    select: { id: true },
    orderBy: { userId: { sort: "desc", nulls: "last" } },
  });
  return fallback?.id ?? null;
}
