import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { normalizeReason } from "@/lib/reason";
import type { TransactionKind } from "@/generated/prisma/client";

// Cuántos motivos del historial se suman a los guardados, por categoría.
const HISTORY_SUGGESTIONS_LIMIT = 6;

export async function getCategories(kind: TransactionKind) {
  const userId = await requireUserId();

  return prisma.category.findMany({
    where: { kind, OR: [{ userId: null }, { userId }] },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getAllCategories() {
  const userId = await requireUserId();

  return prisma.category.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    include: {
      reasons: {
        where: { OR: [{ userId: null }, { userId }] },
        select: { id: true, name: true, userId: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
}

// `saved`: guardado como sugerencia (predefinido o propio). Si no, sale del historial.
export type ReasonSuggestion = { name: string; saved: boolean };

// Motivos sugeridos por categoría: primero los guardados y después los más
// usados en los movimientos del usuario, sin repetir.
export async function getReasonSuggestions(): Promise<Record<string, ReasonSuggestion[]>> {
  const userId = await requireUserId();

  const [saved, used] = await Promise.all([
    prisma.categoryReason.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      select: { categoryId: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId", "reason"],
      where: { userId, reason: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const suggestions: Record<string, ReasonSuggestion[]> = {};
  const seen = new Map<string, Set<string>>();

  function add(categoryId: string, name: string, isSaved: boolean) {
    const key = normalizeReason(name);
    if (!key) return false;
    const keys = seen.get(categoryId) ?? new Set<string>();
    if (keys.has(key)) return false;
    keys.add(key);
    seen.set(categoryId, keys);
    (suggestions[categoryId] ??= []).push({ name: name.trim(), saved: isSaved });
    return true;
  }

  for (const item of saved) add(item.categoryId, item.name, true);

  const historyCount = new Map<string, number>();
  const byUse = [...used].sort((a, b) => b._count._all - a._count._all);
  for (const row of byUse) {
    const count = historyCount.get(row.categoryId) ?? 0;
    if (count >= HISTORY_SUGGESTIONS_LIMIT || !row.reason) continue;
    if (add(row.categoryId, row.reason, false)) historyCount.set(row.categoryId, count + 1);
  }

  return suggestions;
}

// Ventana para decidir qué categorías se usan seguido.
const FREQUENT_WINDOW_DAYS = 90;
const FREQUENT_LIMIT = 10;

// Ids de las categorías más usadas últimamente (de ambos tipos), de más a menos.
export async function getFrequentCategoryIds() {
  const userId = await requireUserId();
  const since = new Date(Date.now() - FREQUENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { userId, date: { gte: since } },
    _count: { categoryId: true },
    orderBy: { _count: { categoryId: "desc" } },
    take: FREQUENT_LIMIT,
  });

  return rows.map((row) => row.categoryId);
}
