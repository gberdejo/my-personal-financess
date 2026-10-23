"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseDateOnly, todayInLima } from "@/lib/date";
import { isPaymentMethod } from "@/lib/labels";
import { estimateOperationCount, planRoulette, rouletteFee } from "@/lib/roulette";
import type { PaymentMethod, RouletteOperation } from "@/generated/prisma/client";
import { isDueDateOf } from "@/features/schedule/periods";

export type RouletteActionState = { error?: string } | null;

// Motivo de los gastos de comisión, para que se agrupen entre sí.
const COMMISSION_REASON = "Comisión ruleteo";
// Tope para que un plan mal escrito (ej. máximo S/ 1) no genere miles de filas.
const MAX_PLANNED_OPERATIONS = 200;
// La comisión se ingresa en %; más de esto es casi seguro un error de tipeo.
const MAX_FEE_PERCENT = 20;

function revalidateSchedule() {
  // "layout" incluye la página de detalle de cada vencimiento.
  revalidatePath("/dashboard/calendario", "layout");
}

// Registrar o deshacer crea/borra el gasto de la comisión.
function revalidateAll() {
  revalidateSchedule();
  revalidatePath("/dashboard/transacciones");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cuentas");
}

function readText(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

function readAmount(formData: FormData, field: string) {
  const amount = Number(formData.get(field));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

// El formulario pide el %, se guarda como fracción (2 → 0.02).
function readFeeRate(formData: FormData) {
  const raw = readText(formData, "feePercent");
  const percent = Number(raw);
  if (!raw || !Number.isFinite(percent) || percent < 0 || percent > MAX_FEE_PERCENT) return null;
  return Math.round(percent * 100) / 10000;
}

// Vencimiento de una tarjeta propia, validado contra su regla.
async function findCardDue(userId: string, scheduledPaymentId: string, dueDateValue: string) {
  const dueDate = parseDateOnly(dueDateValue);
  if (!dueDate) return null;
  const payment = await prisma.scheduledPayment.findFirst({
    where: { id: scheduledPaymentId, userId, type: "CREDIT_CARD" },
  });
  if (!payment || !(await isDueDateOf(payment, dueDate))) return null;
  return { payment, dueDate };
}

async function findOwnOperation(userId: string, operationId: string) {
  return prisma.rouletteOperation.findFirst({ where: { id: operationId, userId } });
}

// ---------- Deuda del mes ----------

// Vacío = se borra y el calendario vuelve al estimado.
export async function saveCardStatement(
  scheduledPaymentId: string,
  dueDateValue: string,
  _prevState: RouletteActionState,
  formData: FormData
): Promise<RouletteActionState> {
  const userId = await requireUserId();

  const due = await findCardDue(userId, scheduledPaymentId, dueDateValue);
  if (!due) return { error: "Vencimiento inválido." };

  const where = { scheduledPaymentId_dueDate: { scheduledPaymentId: due.payment.id, dueDate: due.dueDate } };

  if (!readText(formData, "amount")) {
    await prisma.cardStatement.deleteMany({ where: { scheduledPaymentId: due.payment.id, dueDate: due.dueDate } });
  } else {
    const amount = readAmount(formData, "amount");
    if (!amount) return { error: "La deuda debe ser mayor a 0." };
    await prisma.cardStatement.upsert({
      where,
      create: { scheduledPaymentId: due.payment.id, dueDate: due.dueDate, amount },
      update: { amount },
    });
  }

  revalidateSchedule();
  return null;
}

// ---------- Plan de ruleteo ----------

export async function generateRoulettePlan(
  scheduledPaymentId: string,
  dueDateValue: string,
  _prevState: RouletteActionState,
  formData: FormData
): Promise<RouletteActionState> {
  const userId = await requireUserId();

  const due = await findCardDue(userId, scheduledPaymentId, dueDateValue);
  if (!due) return { error: "Vencimiento inválido." };

  const net = readAmount(formData, "net");
  const provider = readText(formData, "provider");
  const rate = readFeeRate(formData);
  const maxCharge = readAmount(formData, "maxCharge");
  const start = parseDateOnly(readText(formData, "start"));
  const end = parseDateOnly(readText(formData, "end"));

  if (!net) return { error: "El monto a cubrir debe ser mayor a 0." };
  if (!provider) return { error: "Escribí el proveedor." };
  if (rate === null) return { error: `La comisión debe estar entre 0 y ${MAX_FEE_PERCENT} %.` };
  if (!maxCharge || maxCharge < 1) return { error: "El máximo por operación debe ser de al menos S/ 1." };
  if (!start || !end) return { error: "Elegí las fechas." };
  if (end < start) return { error: "La fecha final debe ser posterior a la inicial." };

  const estimated = estimateOperationCount(net, rate, maxCharge);
  if (estimated > MAX_PLANNED_OPERATIONS) {
    return { error: `Serían ${estimated} operaciones. Subí el máximo por operación.` };
  }
  const plan = planRoulette({ net, rate, maxCharge, start, end });

  await prisma.rouletteOperation.createMany({
    data: plan.map(({ date, charge }) => ({
      userId,
      scheduledPaymentId: due.payment.id,
      dueDate: due.dueDate,
      date,
      provider,
      feeRate: rate,
      charge,
      fee: rouletteFee(charge, rate),
    })),
  });

  revalidateSchedule();
  return null;
}

// Alta (operationId null) o edición de una operación. Las registradas no se
// editan: primero hay que deshacerlas para no desalinear el gasto.
export async function saveRouletteOperation(
  scheduledPaymentId: string,
  dueDateValue: string,
  operationId: string | null,
  _prevState: RouletteActionState,
  formData: FormData
): Promise<RouletteActionState> {
  const userId = await requireUserId();

  const due = await findCardDue(userId, scheduledPaymentId, dueDateValue);
  if (!due) return { error: "Vencimiento inválido." };

  const date = parseDateOnly(readText(formData, "date"));
  const provider = readText(formData, "provider");
  const rate = readFeeRate(formData);
  const charge = readAmount(formData, "charge");

  if (!date) return { error: "La fecha no es válida." };
  if (!provider) return { error: "Escribí el proveedor." };
  if (rate === null) return { error: `La comisión debe estar entre 0 y ${MAX_FEE_PERCENT} %.` };
  if (!charge) return { error: "El cargo debe ser mayor a 0." };

  const data = { date, provider, feeRate: rate, charge, fee: rouletteFee(charge, rate) };

  if (operationId) {
    const operation = await findOwnOperation(userId, operationId);
    if (!operation) return { error: "Operación inválida." };
    if (operation.transactionId) return { error: "Deshacé el registro antes de editarla." };
    await prisma.rouletteOperation.update({ where: { id: operation.id }, data });
  } else {
    await prisma.rouletteOperation.create({
      data: { userId, scheduledPaymentId: due.payment.id, dueDate: due.dueDate, ...data },
    });
  }

  revalidateSchedule();
  return null;
}

// ---------- Registrar la comisión ----------

type CommissionTarget = { accountId: string; categoryId: string; paymentMethod: PaymentMethod };

async function readCommissionTarget(
  userId: string,
  formData: FormData
): Promise<{ error: string } | { target: CommissionTarget }> {
  const accountId = readText(formData, "accountId");
  const categoryId = readText(formData, "categoryId");
  const paymentMethod = readText(formData, "paymentMethod");

  if (!isPaymentMethod(paymentMethod)) return { error: "Elegí un método de pago." };

  const account = accountId
    ? await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } })
    : null;
  if (!account) return { error: "Elegí una cuenta." };

  const category = categoryId
    ? await prisma.category.findFirst({
        where: { id: categoryId, kind: "EXPENSE", OR: [{ userId: null }, { userId }] },
        select: { id: true },
      })
    : null;
  if (!category) return { error: "Elegí una categoría." };

  return { target: { accountId: account.id, categoryId: category.id, paymentMethod } };
}

// Gasto de la comisión, con la fecha del ruleteo. Las operaciones sin comisión
// (0 %) no llegan acá: un gasto de S/ 0 no aporta nada.
async function createCommission(userId: string, operation: RouletteOperation, target: CommissionTarget) {
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        userId,
        accountId: target.accountId,
        categoryId: target.categoryId,
        kind: "EXPENSE",
        amount: Number(operation.fee),
        reason: COMMISSION_REASON,
        description: `${operation.provider} · cargo S/ ${Number(operation.charge).toFixed(2)}`,
        date: operation.date,
        paymentMethod: target.paymentMethod,
      },
    });
    await tx.rouletteOperation.update({ where: { id: operation.id }, data: { transactionId: transaction.id } });
  });
}

export async function registerRouletteOperation(
  operationId: string,
  _prevState: RouletteActionState,
  formData: FormData
): Promise<RouletteActionState> {
  const userId = await requireUserId();

  const operation = await findOwnOperation(userId, operationId);
  if (!operation) return { error: "Operación inválida." };
  if (operation.transactionId) return { error: "Esta operación ya fue registrada." };
  if (Number(operation.fee) <= 0) return { error: "Esta operación no tiene comisión que registrar." };

  const result = await readCommissionTarget(userId, formData);
  if ("error" in result) return { error: result.error };

  await createCommission(userId, operation, result.target);

  revalidateAll();
  return null;
}

// Registra de una vez las operaciones pendientes con fecha hasta hoy.
export async function registerDueRouletteOperations(
  scheduledPaymentId: string,
  dueDateValue: string,
  _prevState: RouletteActionState,
  formData: FormData
): Promise<RouletteActionState> {
  const userId = await requireUserId();

  const due = await findCardDue(userId, scheduledPaymentId, dueDateValue);
  if (!due) return { error: "Vencimiento inválido." };

  const result = await readCommissionTarget(userId, formData);
  if ("error" in result) return { error: result.error };

  const operations = await prisma.rouletteOperation.findMany({
    where: {
      userId,
      scheduledPaymentId: due.payment.id,
      dueDate: due.dueDate,
      transactionId: null,
      fee: { gt: 0 },
      date: { lte: todayInLima() },
    },
    orderBy: { date: "asc" },
  });
  if (operations.length === 0) return { error: "No hay operaciones pendientes hasta hoy." };

  for (const operation of operations) {
    await createCommission(userId, operation, result.target);
  }

  revalidateAll();
  return null;
}

// Borra el gasto de la comisión; la operación vuelve a planificada (onDelete: SetNull).
export async function undoRouletteOperation(operationId: string) {
  const userId = await requireUserId();

  const operation = await findOwnOperation(userId, operationId);
  if (!operation?.transactionId) return;

  await prisma.transaction.deleteMany({ where: { id: operation.transactionId, userId } });
  revalidateAll();
}

// Si estaba registrada, también se borra el gasto de su comisión.
export async function deleteRouletteOperation(operationId: string) {
  const userId = await requireUserId();

  const operation = await findOwnOperation(userId, operationId);
  if (!operation) return;

  await prisma.$transaction(async (tx) => {
    await tx.rouletteOperation.delete({ where: { id: operation.id } });
    if (operation.transactionId) {
      await tx.transaction.deleteMany({ where: { id: operation.transactionId, userId } });
    }
  });

  if (operation.transactionId) revalidateAll();
  else revalidateSchedule();
}
