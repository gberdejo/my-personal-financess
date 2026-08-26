import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import type { TransactionKind } from "@/generated/prisma/client";

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
    orderBy: { name: "asc" },
  });
}
