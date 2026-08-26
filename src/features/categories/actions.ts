"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import type { TransactionKind } from "@/generated/prisma/client";

export type CategoryActionState = {
  error?: string;
  category?: { id: string; name: string; kind: TransactionKind; icon: string | null };
} | null;

export async function createCategory(
  _prevState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const userId = await requireUserId();

  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as TransactionKind;

  if (!name) return { error: "El nombre es obligatorio." };
  if (kind !== "INCOME" && kind !== "EXPENSE") return { error: "Categoría inválida." };

  try {
    const category = await prisma.category.create({
      data: { userId, name, kind },
    });
    revalidatePath("/dashboard/transacciones");
    return { category: { id: category.id, name: category.name, kind: category.kind, icon: category.icon } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya tenés una categoría con ese nombre." };
    }
    throw error;
  }
}
