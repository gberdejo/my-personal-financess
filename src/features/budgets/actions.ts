"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import { isPaymentMethod } from "@/lib/labels";
import type { BudgetTemplate } from "@/generated/prisma/client";
import { BUDGET_TEMPLATES, BUDGET_TEMPLATE_ITEMS, FALLBACK_CATEGORY_NAME } from "./templates";

export type BudgetActionState = { error?: string } | null;

function revalidateBudgets() {
  revalidatePath("/dashboard/presupuestos", "layout");
}

// Aplicar o deshacer crea/borra transacciones, así que también cambian
// los saldos, el resumen y la lista de movimientos.
function revalidateAll() {
  revalidateBudgets();
  revalidatePath("/dashboard/transacciones");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cuentas");
}

function readOptionalDate(formData: FormData, field: string): Date | null | "invalid" {
  const raw = String(formData.get(field) ?? "");
  if (!raw) return null;
  return parseDateOnly(raw) ?? "invalid";
}

async function findOwnAccount(userId: string, accountId: string) {
  if (!accountId) return null;
  return prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
}

async function findExpenseCategory(userId: string, categoryId: string) {
  if (!categoryId) return null;
  return prisma.category.findFirst({
    where: { id: categoryId, kind: "EXPENSE", OR: [{ userId: null }, { userId }] },
    select: { id: true },
  });
}

async function findOwnItem(userId: string, itemId: string) {
  return prisma.budgetItem.findFirst({ where: { id: itemId, budget: { userId } } });
}

// ---------- Presupuestos ----------

export async function createBudget(_prevState: BudgetActionState, formData: FormData): Promise<BudgetActionState> {
  const userId = await requireUserId();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const template = String(formData.get("template") ?? "BLANK") as BudgetTemplate;
  const accountId = String(formData.get("accountId") ?? "");
  const date = readOptionalDate(formData, "date");

  if (!title) return { error: "El título es obligatorio." };
  if (!BUDGET_TEMPLATES.includes(template)) return { error: "Plantilla inválida." };
  if (date === "invalid") return { error: "La fecha no es válida." };

  const account = await findOwnAccount(userId, accountId);
  if (accountId && !account) return { error: "Cuenta inválida." };

  const templateItems = BUDGET_TEMPLATE_ITEMS[template];
  const categories = templateItems.length
    ? await prisma.category.findMany({
        where: { kind: "EXPENSE", OR: [{ userId: null }, { userId }] },
        select: { id: true, name: true, userId: true },
      })
    : [];
  // Si el usuario tiene una categoría propia con el mismo nombre que una global, gana la suya.
  const categoryByName = new Map<string, string>();
  for (const category of [...categories].sort((a, b) => Number(!!a.userId) - Number(!!b.userId))) {
    categoryByName.set(category.name, category.id);
  }
  const fallbackId = categoryByName.get(FALLBACK_CATEGORY_NAME) ?? categories[0]?.id;

  const items = templateItems.flatMap((item) => {
    const categoryId = categoryByName.get(item.categoryName) ?? fallbackId;
    return categoryId ? [{ description: item.description, categoryId }] : [];
  });

  const budget = await prisma.budget.create({
    data: {
      userId,
      title,
      description,
      date,
      template,
      accountId: account?.id ?? null,
      items: { create: items },
    },
  });

  revalidateBudgets();
  redirect(`/dashboard/presupuestos/${budget.id}`);
}

export async function updateBudget(
  budgetId: string,
  _prevState: BudgetActionState,
  formData: FormData
): Promise<BudgetActionState> {
  const userId = await requireUserId();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const accountId = String(formData.get("accountId") ?? "");
  const date = readOptionalDate(formData, "date");

  if (!title) return { error: "El título es obligatorio." };
  if (date === "invalid") return { error: "La fecha no es válida." };

  const account = await findOwnAccount(userId, accountId);
  if (accountId && !account) return { error: "Cuenta inválida." };

  const result = await prisma.budget.updateMany({
    where: { id: budgetId, userId },
    data: { title, description, date, accountId: account?.id ?? null },
  });
  if (result.count === 0) return { error: "No se pudo actualizar el presupuesto." };

  revalidateBudgets();
  return null;
}

// Los gastos ya aplicados se quedan en Transacciones: son gastos reales.
export async function deleteBudget(budgetId: string) {
  const userId = await requireUserId();
  await prisma.budget.deleteMany({ where: { id: budgetId, userId } });
  revalidateAll();
  redirect("/dashboard/presupuestos");
}

// ---------- Líneas ----------

export async function saveBudgetItem(
  budgetId: string,
  itemId: string | null,
  _prevState: BudgetActionState,
  formData: FormData
): Promise<BudgetActionState> {
  const userId = await requireUserId();

  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const useQuantity = formData.get("useQuantity") === "on";

  if (!description) return { error: "La descripción es obligatoria." };

  const category = await findExpenseCategory(userId, categoryId);
  if (!category) return { error: "Elegí una categoría." };

  let quantity: number | null = null;
  let unitPrice: number | null = null;
  let amount: number;

  if (useQuantity) {
    quantity = Number(formData.get("quantity"));
    unitPrice = Number(formData.get("unitPrice"));
    if (!quantity || quantity <= 0) return { error: "La cantidad debe ser mayor a 0." };
    if (Number.isNaN(unitPrice) || unitPrice < 0) return { error: "El precio unitario no es válido." };
    amount = Math.round(quantity * unitPrice * 100) / 100;
  } else {
    amount = Number(formData.get("amount") || 0);
    if (Number.isNaN(amount) || amount < 0) return { error: "El monto no es válido." };
  }

  const data = { description, categoryId: category.id, quantity, unitPrice, amount };

  if (itemId) {
    const result = await prisma.budgetItem.updateMany({
      where: { id: itemId, budgetId, transactionId: null, budget: { userId } },
      data,
    });
    if (result.count === 0) return { error: "No se pudo actualizar el gasto. Si ya está aplicado, deshacelo primero." };
  } else {
    const budget = await prisma.budget.findFirst({ where: { id: budgetId, userId }, select: { id: true } });
    if (!budget) return { error: "Presupuesto inválido." };
    await prisma.budgetItem.create({ data: { ...data, budgetId } });
  }

  revalidateBudgets();
  return null;
}

export async function deleteBudgetItem(itemId: string) {
  const userId = await requireUserId();
  await prisma.budgetItem.deleteMany({ where: { id: itemId, transactionId: null, budget: { userId } } });
  revalidateBudgets();
}

// ---------- Aplicar / deshacer ----------

export async function applyBudgetItem(
  itemId: string,
  _prevState: BudgetActionState,
  formData: FormData
): Promise<BudgetActionState> {
  const userId = await requireUserId();

  const accountId = String(formData.get("accountId") ?? "");
  const amount = Number(formData.get("amount"));
  const date = readOptionalDate(formData, "date");
  const paymentMethod = String(formData.get("paymentMethod") ?? "");

  if (!amount || amount <= 0) return { error: "El monto debe ser mayor a 0." };
  if (!date || date === "invalid") return { error: "La fecha no es válida." };
  if (!isPaymentMethod(paymentMethod)) return { error: "Elegí un método de pago." };

  const account = await findOwnAccount(userId, accountId);
  if (!account) return { error: "Elegí una cuenta." };

  const item = await findOwnItem(userId, itemId);
  if (!item) return { error: "Gasto inválido." };
  if (item.transactionId) return { error: "Este gasto ya fue aplicado." };

  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: item.categoryId,
        kind: "EXPENSE",
        amount,
        // El texto de la línea es el motivo del gasto.
        reason: item.description,
        date,
        paymentMethod,
      },
    });
    await tx.budgetItem.update({ where: { id: item.id }, data: { transactionId: transaction.id } });
  });

  revalidateAll();
  return null;
}

// Aplica de golpe todas las líneas pendientes con monto mayor a 0, por su monto planificado.
export async function applyPendingBudgetItems(
  budgetId: string,
  _prevState: BudgetActionState,
  formData: FormData
): Promise<BudgetActionState> {
  const userId = await requireUserId();

  const accountId = String(formData.get("accountId") ?? "");
  const date = readOptionalDate(formData, "date");
  const paymentMethod = String(formData.get("paymentMethod") ?? "");

  if (!date || date === "invalid") return { error: "La fecha no es válida." };
  if (!isPaymentMethod(paymentMethod)) return { error: "Elegí un método de pago." };

  const account = await findOwnAccount(userId, accountId);
  if (!account) return { error: "Elegí una cuenta." };

  const items = await prisma.budgetItem.findMany({
    where: { budgetId, transactionId: null, amount: { gt: 0 }, budget: { userId } },
  });
  if (items.length === 0) return { error: "No hay gastos pendientes con monto para aplicar." };

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const transaction = await tx.transaction.create({
        data: {
          userId,
          accountId: account.id,
          categoryId: item.categoryId,
          kind: "EXPENSE",
          amount: item.amount,
          reason: item.description,
          date,
          paymentMethod,
        },
      });
      await tx.budgetItem.update({ where: { id: item.id }, data: { transactionId: transaction.id } });
    }
  });

  revalidateAll();
  return null;
}

// Borra el gasto generado; la línea vuelve a pendiente (onDelete: SetNull).
export async function undoBudgetItem(itemId: string) {
  const userId = await requireUserId();

  const item = await findOwnItem(userId, itemId);
  if (!item?.transactionId) return;

  await prisma.transaction.deleteMany({ where: { id: item.transactionId, userId } });
  revalidateAll();
}
