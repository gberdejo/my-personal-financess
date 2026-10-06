"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import type { TransactionKind } from "@/generated/prisma/client";
import { saveCategoryReason } from "./reasons";

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

export type RenameCategoryState = { error?: string } | null;

export async function renameCategory(
  categoryId: string,
  _prevState: RenameCategoryState,
  formData: FormData
): Promise<RenameCategoryState> {
  const userId = await requireUserId();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "El nombre es obligatorio." };

  try {
    const result = await prisma.category.updateMany({
      where: { id: categoryId, userId },
      data: { name },
    });
    if (result.count === 0) return { error: "No se pudo renombrar la categoría." };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya tenés una categoría con ese nombre." };
    }
    throw error;
  }

  revalidatePath("/dashboard/categorias");
  revalidatePath("/dashboard/transacciones");
  revalidatePath("/dashboard/presupuestos");
  revalidatePath("/dashboard");
  return null;
}

export type CategoryReasonState = { error?: string } | null;

function revalidateReasons() {
  revalidatePath("/dashboard/categorias");
  revalidatePath("/dashboard/transacciones");
}

export async function createCategoryReason(
  categoryId: string,
  _prevState: CategoryReasonState,
  formData: FormData
): Promise<CategoryReasonState> {
  const userId = await requireUserId();

  const result = await saveCategoryReason(userId, categoryId, String(formData.get("name") ?? ""));
  if ("error" in result) return { error: result.error };

  revalidateReasons();
  return null;
}

// Solo se pueden borrar los propios; los predefinidos quedan.
export async function deleteCategoryReason(reasonId: string) {
  const userId = await requireUserId();
  await prisma.categoryReason.deleteMany({ where: { id: reasonId, userId } });
  revalidateReasons();
}
