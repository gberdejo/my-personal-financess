import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { shiftDay } from "@/lib/date";
import { counterpartyKey, isImportSource, type ImportSource } from "@/lib/imports/sources";
import { normalizeReason } from "@/lib/reason";
import { amountLockInfo, type AmountLock } from "@/lib/transaction-lock";
import { getReasonSuggestions } from "@/features/categories/queries";
import type { PaymentMethod, TransactionKind } from "@/generated/prisma/client";

// PENDING: cargado, sin transacción. APPLIED: tiene transacción. DISCARDED: no se va a aplicar.
export type MovementStatus = "PENDING" | "APPLIED" | "DISCARDED";

const DAY_MS = 24 * 60 * 60 * 1000;

function movementStatus(movement: { transactionId: string | null; discarded: boolean }): MovementStatus {
  if (movement.transactionId) return "APPLIED";
  return movement.discarded ? "DISCARDED" : "PENDING";
}

function countByStatus(movements: { transactionId: string | null; discarded: boolean }[]) {
  const counts: Record<MovementStatus, number> = { PENDING: 0, APPLIED: 0, DISCARDED: 0 };
  for (const movement of movements) counts[movementStatus(movement)]++;
  return counts;
}

export type ImportSummary = {
  id: string;
  source: ImportSource | null;
  rawSource: string;
  fileName: string;
  accountId: string | null;
  accountName: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  createdAt: Date;
  total: number;
  // Movimientos del archivo que ya estaban importados y no se cargaron.
  skippedCount: number;
  counts: Record<MovementStatus, number>;
};

export async function getImports(): Promise<ImportSummary[]> {
  const userId = await requireUserId();

  const imports = await prisma.transactionImport.findMany({
    where: { userId },
    include: {
      account: { select: { name: true } },
      movements: { select: { transactionId: true, discarded: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return imports.map((item) => ({
    id: item.id,
    source: isImportSource(item.source) ? item.source : null,
    rawSource: item.source,
    fileName: item.fileName,
    accountId: item.accountId,
    accountName: item.account?.name ?? null,
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
    createdAt: item.createdAt,
    total: item.movements.length,
    skippedCount: item.skippedCount,
    counts: countByStatus(item.movements),
  }));
}

// Transacción ya registrada que podría ser el mismo movimiento.
export type DuplicateCandidate = {
  id: string;
  date: Date;
  createdAt: Date;
  amount: number;
  categoryName: string;
  accountName: string;
  reason: string | null;
  description: string | null;
};

export type ImportedMovementRow = {
  id: string;
  row: number;
  occurredAt: Date;
  date: Date;
  kind: TransactionKind;
  amount: number;
  counterparty: string | null;
  message: string | null;
  rawType: string;
  status: MovementStatus;
  // Lo necesario para mostrarla y editarla desde la importación.
  transaction: {
    id: string;
    kind: TransactionKind;
    date: Date;
    // Puede diferir del monto del archivo si se editó la transacción.
    amount: number;
    categoryId: string;
    categoryName: string;
    accountName: string;
    reason: string | null;
    description: string | null;
    paymentMethod: PaymentMethod | null;
    receiptUrls: string[];
    amountLock: { kind: AmountLock; href: string } | null;
    // true si la creó este movimiento; false si se vinculó a una existente.
    created: boolean;
  } | null;
  // Categoría y motivo propuestos para aplicarlo.
  suggestion: { categoryId: string | null; reason: string };
  missingCategory: string | null;
  // Método de pago y comprobantes que trae la fila (plantilla genérica).
  paymentMethod: PaymentMethod | null;
  receiptUrls: string[];
  duplicates: DuplicateCandidate[];
  // Fecha de otra importación que ya trajo este mismo movimiento.
  alsoImportedAt: Date | null;
};

export type ImportDetail = { summary: ImportSummary; movements: ImportedMovementRow[] };

// Categoría y motivo del último movimiento aplicado con la misma contraparte
// (y tipo), para proponerlos en los nuevos.
async function counterpartyHistory(userId: string) {
  const applied = await prisma.importedMovement.findMany({
    where: { userId, transactionId: { not: null } },
    select: {
      kind: true,
      counterparty: true,
      transaction: { select: { categoryId: true, reason: true } },
    },
    orderBy: { occurredAt: "desc" },
  });
  const byKey = new Map<string, { categoryId: string; reason: string | null }>();
  for (const movement of applied) {
    const key = `${movement.kind}|${counterpartyKey(movement.counterparty)}`;
    if (!movement.transaction || !counterpartyKey(movement.counterparty) || byKey.has(key)) continue;
    byKey.set(key, movement.transaction);
  }
  return byKey;
}

// Categoría por tipo según su nombre (la que trae la plantilla) o según un motivo
// (de los guardados y del historial), con claves normalizadas.
async function categoryLookups(userId: string) {
  const [suggestions, categories] = await Promise.all([
    getReasonSuggestions(),
    prisma.category.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      select: { id: true, kind: true, name: true },
    }),
  ]);
  const byName = new Map(categories.map((c) => [`${c.kind}|${counterpartyKey(c.name)}`, c.id]));
  const kindById = new Map(categories.map((c) => [c.id, c.kind]));
  const byReason = new Map<string, string>();
  for (const [categoryId, reasons] of Object.entries(suggestions)) {
    const kind = kindById.get(categoryId);
    if (!kind) continue;
    for (const reason of reasons) {
      const key = `${kind}|${normalizeReason(reason.name)}`;
      if (!byReason.has(key)) byReason.set(key, categoryId);
    }
  }
  return { byName, byReason };
}

export async function getImport(importId: string): Promise<ImportDetail | null> {
  const userId = await requireUserId();

  const item = await prisma.transactionImport.findFirst({
    where: { id: importId, userId },
    include: {
      account: { select: { name: true } },
      movements: {
        include: {
          transaction: {
            select: {
              id: true,
              kind: true,
              date: true,
              amount: true,
              categoryId: true,
              reason: true,
              description: true,
              paymentMethod: true,
              receiptUrls: true,
              category: { select: { name: true } },
              account: { select: { name: true } },
              loanPrepayment: { select: { scheduledPaymentId: true } },
              rouletteOperation: { select: { scheduledPaymentId: true, dueDate: true } },
            },
          },
        },
        orderBy: [{ occurredAt: "desc" }, { row: "asc" }],
      },
    },
  });
  if (!item) return null;

  const pending = item.movements.filter((m) => movementStatus(m) === "PENDING");
  const dates = pending.map((m) => m.date.getTime());
  const [history, { byName, byReason }, candidates, sameFingerprint] = await Promise.all([
    counterpartyHistory(userId),
    categoryLookups(userId),
    pending.length
      ? prisma.transaction.findMany({
          where: {
            userId,
            date: { gte: shiftDay(new Date(Math.min(...dates)), -1), lte: shiftDay(new Date(Math.max(...dates)), 1) },
          },
          include: {
            category: { select: { name: true } },
            account: { select: { name: true } },
            importedMovements: { select: { importId: true } },
          },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        })
      : [],
    prisma.importedMovement.findMany({
      where: {
        userId,
        importId: { not: item.id },
        fingerprint: { in: item.movements.map((m) => m.fingerprint) },
      },
      select: { fingerprint: true, import: { select: { createdAt: true } } },
    }),
  ]);

  // Transacciones que ya vienen de esta importación no cuentan como duplicado.
  const others = candidates.filter((t) => !t.importedMovements.some((m) => m.importId === item.id));
  const importedAt = new Map<string, Date>();
  for (const other of sameFingerprint) {
    const current = importedAt.get(other.fingerprint);
    if (!current || other.import.createdAt < current) importedAt.set(other.fingerprint, other.import.createdAt);
  }

  const movements = item.movements.map((m): ImportedMovementRow => {
    const amount = Number(m.amount);
    const status = movementStatus(m);
    const previous = history.get(`${m.kind}|${counterpartyKey(m.counterparty)}`);
    // Primero lo que trae el archivo (plantilla genérica). Si no, el motivo de
    // la última vez con esa persona (el mensaje va en la descripción).
    const fileCategoryId = m.categoryName ? (byName.get(`${m.kind}|${counterpartyKey(m.categoryName)}`) ?? null) : null;
    const reason = m.reason ?? previous?.reason ?? "";
    const categoryId =
      fileCategoryId ??
      previous?.categoryId ??
      (m.message ? (byReason.get(`${m.kind}|${normalizeReason(m.message)}`) ?? null) : null);
    return {
      id: m.id,
      row: m.row,
      occurredAt: m.occurredAt,
      date: m.date,
      kind: m.kind,
      amount,
      counterparty: m.counterparty,
      message: m.message,
      rawType: m.rawType,
      status,
      transaction: m.transaction
        ? {
            id: m.transaction.id,
            kind: m.transaction.kind,
            date: m.transaction.date,
            amount: Number(m.transaction.amount),
            categoryId: m.transaction.categoryId,
            categoryName: m.transaction.category.name,
            accountName: m.transaction.account.name,
            reason: m.transaction.reason,
            description: m.transaction.description,
            paymentMethod: m.transaction.paymentMethod,
            receiptUrls: m.transaction.receiptUrls,
            amountLock: amountLockInfo(m.transaction),
            created: m.createdTransaction,
          }
        : null,
      suggestion: { categoryId, reason },
      // Categoría del archivo que no existe (para avisar y poder crearla).
      missingCategory: m.categoryName && !fileCategoryId ? m.categoryName : null,
      paymentMethod: m.paymentMethod,
      receiptUrls: m.receiptUrls,
      duplicates:
        status === "PENDING"
          ? others
              .filter(
                (t) =>
                  t.kind === m.kind &&
                  Number(t.amount) === amount &&
                  Math.abs(t.date.getTime() - m.date.getTime()) <= DAY_MS
              )
              .map((t) => ({
                id: t.id,
                date: t.date,
                createdAt: t.createdAt,
                amount: Number(t.amount),
                categoryName: t.category.name,
                accountName: t.account.name,
                reason: t.reason,
                description: t.description,
              }))
          : [],
      alsoImportedAt: importedAt.get(m.fingerprint) ?? null,
    };
  });

  return {
    summary: {
      id: item.id,
      source: isImportSource(item.source) ? item.source : null,
      rawSource: item.source,
      fileName: item.fileName,
      accountId: item.accountId,
      accountName: item.account?.name ?? null,
      periodStart: item.periodStart,
      periodEnd: item.periodEnd,
      createdAt: item.createdAt,
      total: item.movements.length,
      skippedCount: item.skippedCount,
      counts: countByStatus(item.movements),
    },
    movements,
  };
}
