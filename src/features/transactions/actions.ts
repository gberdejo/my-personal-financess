"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import type { TransactionKind } from "@/generated/prisma/client";

export type ActionState = { error?: string } | null;

function revalidateAll() {
  revalidatePath("/dashboard/transacciones");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cuentas");
  // Borrar un gasto aplicado desde un presupuesto devuelve su línea a pendiente.
  revalidatePath("/dashboard/presupuestos", "layout");
}

export async function createTransaction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();

  const kind = String(formData.get("kind") ?? "") as TransactionKind;
  const accountId = String(formData.get("accountId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const amount = Number(formData.get("amount"));
  const description = String(formData.get("description") ?? "").trim() || null;
  const dateRaw = String(formData.get("date") ?? "");

  if (kind !== "INCOME" && kind !== "EXPENSE") return { error: "Tipo de movimiento inválido." };
  if (!accountId) return { error: "Elegí una cuenta." };
  if (!categoryId) return { error: "Elegí una categoría." };
  if (!amount || amount <= 0) return { error: "El monto debe ser mayor a 0." };
  if (!dateRaw) return { error: "La fecha es obligatoria." };

  const date = parseDateOnly(dateRaw);
  if (!date) return { error: "La fecha no es válida." };

  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) return { error: "Cuenta inválida." };

  const category = await prisma.category.findFirst({
    where: { id: categoryId, kind, OR: [{ userId: null }, { userId }] },
  });
  if (!category) return { error: "Categoría inválida." };

  await prisma.transaction.create({
    data: { userId, accountId, categoryId, kind, amount, description, date },
  });

  revalidateAll();
  return null;
}

export async function updateTransactionDate(
  transactionId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const dateRaw = String(formData.get("date") ?? "");
  if (!dateRaw) return { error: "La fecha es obligatoria." };

  const date = parseDateOnly(dateRaw);
  if (!date) return { error: "La fecha no es válida." };

  const result = await prisma.transaction.updateMany({
    where: { id: transactionId, userId },
    data: { date },
  });
  if (result.count === 0) return { error: "No se pudo actualizar el movimiento." };

  revalidateAll();
  return null;
}

export async function deleteTransaction(transactionId: string) {
  const userId = await requireUserId();
  await prisma.transaction.deleteMany({ where: { id: transactionId, userId } });
  revalidateAll();
}
