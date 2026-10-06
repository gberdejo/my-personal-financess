"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import { isPaymentMethod } from "@/lib/labels";
import { saveCategoryReason } from "@/features/categories/reasons";
import type { PaymentMethod, TransactionKind } from "@/generated/prisma/client";

export type ActionState = { error?: string } | null;

function revalidateAll() {
  revalidatePath("/dashboard/transacciones");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cuentas");
  // Borrar un gasto aplicado desde un presupuesto devuelve su línea a pendiente.
  revalidatePath("/dashboard/presupuestos", "layout");
}

function readPaymentMethod(formData: FormData): PaymentMethod | null {
  const raw = String(formData.get("paymentMethod") ?? "");
  return isPaymentMethod(raw) ? raw : null;
}

// Motivo (con sugerencias) y descripción (nota libre) son opcionales.
function readText(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim() || null;
}

// Reutilizar el motivo ayuda a que los gastos recurrentes coincidan. Si ya
// existía, no pasa nada: el movimiento ya quedó guardado.
async function maybeSaveReason(userId: string, categoryId: string, reason: string | null, formData: FormData) {
  if (!reason || formData.get("saveReason") !== "on") return;
  await saveCategoryReason(userId, categoryId, reason);
  revalidatePath("/dashboard/categorias");
}

export async function createTransaction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();

  const kind = String(formData.get("kind") ?? "") as TransactionKind;
  const accountId = String(formData.get("accountId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const amount = Number(formData.get("amount"));
  const reason = readText(formData, "reason");
  const description = readText(formData, "description");
  const dateRaw = String(formData.get("date") ?? "");
  // Los ingresos no llevan método de pago.
  const paymentMethod = kind === "EXPENSE" ? readPaymentMethod(formData) : null;

  if (kind !== "INCOME" && kind !== "EXPENSE") return { error: "Tipo de movimiento inválido." };
  if (!accountId) return { error: "Elegí una cuenta." };
  if (!categoryId) return { error: "Elegí una categoría." };
  if (!amount || amount <= 0) return { error: "El monto debe ser mayor a 0." };
  if (kind === "EXPENSE" && !paymentMethod) return { error: "Elegí un método de pago." };
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
    data: { userId, accountId, categoryId, kind, amount, reason, description, date, paymentMethod },
  });

  await maybeSaveReason(userId, categoryId, reason, formData);

  revalidateAll();
  return null;
}

export async function updateTransaction(
  transactionId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();

  const dateRaw = String(formData.get("date") ?? "");
  if (!dateRaw) return { error: "La fecha es obligatoria." };

  const date = parseDateOnly(dateRaw);
  if (!date) return { error: "La fecha no es válida." };

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    select: { kind: true },
  });
  if (!transaction) return { error: "No se pudo actualizar el movimiento." };

  // La categoría puede cambiar, pero solo a otra del mismo tipo (gasto o ingreso).
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!categoryId) return { error: "Elegí una categoría." };
  const category = await prisma.category.findFirst({
    where: { id: categoryId, kind: transaction.kind, OR: [{ userId: null }, { userId }] },
    select: { id: true },
  });
  if (!category) return { error: "Categoría inválida." };

  const paymentMethod = transaction.kind === "EXPENSE" ? readPaymentMethod(formData) : null;
  if (transaction.kind === "EXPENSE" && !paymentMethod) return { error: "Elegí un método de pago." };

  const reason = readText(formData, "reason");
  const description = readText(formData, "description");

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { date, categoryId, paymentMethod, reason, description },
  });

  await maybeSaveReason(userId, categoryId, reason, formData);

  revalidateAll();
  return null;
}

export async function deleteTransaction(transactionId: string) {
  const userId = await requireUserId();
  await prisma.transaction.deleteMany({ where: { id: transactionId, userId } });
  revalidateAll();
}
