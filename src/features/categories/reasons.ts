import { prisma } from "@/lib/prisma";
import { normalizeReason } from "@/lib/reason";

export type SaveReasonResult = { ok: true } | { error: string };

// Guarda un motivo sugerido para la categoría si el usuario puede usarla y no
// existe ya (predefinido o propio, ignorando mayúsculas y espacios).
// No es una server action: recibe el userId ya autenticado.
export async function saveCategoryReason(
  userId: string,
  categoryId: string,
  rawName: string
): Promise<SaveReasonResult> {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (!name) return { error: "El motivo es obligatorio." };

  const category = await prisma.category.findFirst({
    where: { id: categoryId, OR: [{ userId: null }, { userId }] },
    select: { id: true },
  });
  if (!category) return { error: "Categoría inválida." };

  const existing = await prisma.categoryReason.findMany({
    where: { categoryId, OR: [{ userId: null }, { userId }] },
    select: { name: true },
  });
  const key = normalizeReason(name);
  if (existing.some((r) => normalizeReason(r.name) === key)) {
    return { error: "Ese motivo ya existe en la categoría." };
  }

  await prisma.categoryReason.create({ data: { userId, categoryId, name } });
  return { ok: true };
}
