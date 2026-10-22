"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseDateOnly, todayInLima } from "@/lib/date";
import { isPaymentMethod, isScheduleFrequency } from "@/lib/labels";
import { isOccurrenceDate, nextDayOfMonth } from "@/lib/schedule";
import type { PaymentMethod, ScheduledPaymentType, ScheduleFrequency } from "@/generated/prisma/client";

export type ScheduleActionState = { error?: string } | null;

function revalidateSchedule() {
  revalidatePath("/dashboard/calendario");
}

// Pagar o deshacer una cuota crea/borra transacciones, así que también cambian
// los saldos, el resumen y la lista de movimientos.
function revalidateAll() {
  revalidateSchedule();
  revalidatePath("/dashboard/transacciones");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cuentas");
}

function readText(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

function readOptionalDate(formData: FormData, field: string): Date | null | "invalid" {
  const raw = readText(formData, field);
  if (!raw) return null;
  return parseDateOnly(raw) ?? "invalid";
}

function readDay(formData: FormData, field: string) {
  const day = Number(formData.get(field));
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
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

async function findOwnPayment(userId: string, scheduledPaymentId: string) {
  return prisma.scheduledPayment.findFirst({ where: { id: scheduledPaymentId, userId } });
}

type PaymentData = {
  type: ScheduledPaymentType;
  name: string;
  categoryId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
  amount: number | null;
  frequency: ScheduleFrequency;
  startDate: Date;
  endDate: Date | null;
  closingDay: number | null;
};

// Valida el formulario de un pago programado. `currentStartDate` (al editar una
// tarjeta) se conserva si no cambió el día de pago, para no mover el historial.
async function readPaymentForm(
  userId: string,
  formData: FormData,
  type: ScheduledPaymentType,
  currentStartDate?: Date
): Promise<{ error: string } | { data: PaymentData }> {
  const name = readText(formData, "name");
  if (!name) return { error: "El nombre es obligatorio." };

  const accountId = readText(formData, "accountId");
  const account = await findOwnAccount(userId, accountId);
  if (accountId && !account) return { error: "Cuenta inválida." };

  const methodRaw = readText(formData, "paymentMethod");
  if (methodRaw && !isPaymentMethod(methodRaw)) return { error: "Método de pago inválido." };
  const paymentMethod = methodRaw && isPaymentMethod(methodRaw) ? methodRaw : null;

  if (type === "CREDIT_CARD") {
    const dueDay = readDay(formData, "dueDay");
    const closingDay = readDay(formData, "closingDay");
    if (!dueDay) return { error: "El día de pago debe estar entre 1 y 31." };
    if (!closingDay) return { error: "El día de cierre debe estar entre 1 y 31." };

    const startDate =
      currentStartDate && currentStartDate.getUTCDate() === dueDay
        ? currentStartDate
        : nextDayOfMonth(dueDay, todayInLima());

    return {
      data: {
        type,
        name,
        categoryId: null,
        accountId: account?.id ?? null,
        paymentMethod,
        amount: null,
        frequency: "MONTHLY",
        startDate,
        endDate: null,
        closingDay,
      },
    };
  }

  const category = await findExpenseCategory(userId, readText(formData, "categoryId"));
  if (!category) return { error: "Elegí una categoría." };

  const amountRaw = readText(formData, "amount");
  const amount = amountRaw ? Number(amountRaw) : null;
  if (amount !== null && (Number.isNaN(amount) || amount < 0)) return { error: "El monto no es válido." };

  const frequency = readText(formData, "frequency");
  if (!isScheduleFrequency(frequency)) return { error: "Elegí una frecuencia." };

  const startDate = readOptionalDate(formData, "startDate");
  if (!startDate || startDate === "invalid") return { error: "La primera fecha no es válida." };

  const endDate = frequency === "ONCE" ? null : readOptionalDate(formData, "endDate");
  if (endDate === "invalid") return { error: "La fecha de fin no es válida." };
  if (endDate && endDate < startDate) return { error: "La fecha de fin debe ser posterior a la primera fecha." };

  return {
    data: {
      type,
      name,
      categoryId: category.id,
      accountId: account?.id ?? null,
      paymentMethod,
      amount: amount || null,
      frequency,
      startDate,
      endDate,
      closingDay: null,
    },
  };
}

// ---------- Pagos programados ----------

export async function createScheduledPayment(
  _prevState: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const userId = await requireUserId();

  const type = readText(formData, "type") === "CREDIT_CARD" ? "CREDIT_CARD" : "BILL";
  const result = await readPaymentForm(userId, formData, type);
  if ("error" in result) return { error: result.error };

  await prisma.scheduledPayment.create({ data: { userId, ...result.data } });

  revalidateSchedule();
  return null;
}

// El tipo no se cambia al editar. Las cuotas ya pagadas se conservan aunque
// cambie la regla.
export async function updateScheduledPayment(
  scheduledPaymentId: string,
  _prevState: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const userId = await requireUserId();

  const payment = await findOwnPayment(userId, scheduledPaymentId);
  if (!payment) return { error: "No se pudo actualizar el pago." };

  const result = await readPaymentForm(userId, formData, payment.type, payment.startDate);
  if ("error" in result) return { error: result.error };

  await prisma.scheduledPayment.update({
    where: { id: payment.id },
    data: { ...result.data, active: formData.get("active") === "on" },
  });

  revalidateSchedule();
  return null;
}

// Las transacciones ya registradas no se borran; solo sus cuotas.
export async function deleteScheduledPayment(scheduledPaymentId: string) {
  const userId = await requireUserId();
  await prisma.scheduledPayment.deleteMany({ where: { id: scheduledPaymentId, userId } });
  revalidateSchedule();
}

// ---------- Cuotas ----------

async function findPendingOccurrence(userId: string, scheduledPaymentId: string, dueDateValue: string) {
  const payment = await findOwnPayment(userId, scheduledPaymentId);
  if (!payment) return { error: "Pago inválido." } as const;

  const dueDate = parseDateOnly(dueDateValue);
  if (!dueDate || !isOccurrenceDate(payment, dueDate)) return { error: "Fecha de vencimiento inválida." } as const;

  const existing = await prisma.scheduledOccurrence.findUnique({
    where: { scheduledPaymentId_dueDate: { scheduledPaymentId: payment.id, dueDate } },
    select: { id: true },
  });
  if (existing) return { error: "Esta cuota ya fue registrada." } as const;

  return { payment, dueDate } as const;
}

export async function payOccurrence(
  scheduledPaymentId: string,
  dueDateValue: string,
  _prevState: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const userId = await requireUserId();

  const found = await findPendingOccurrence(userId, scheduledPaymentId, dueDateValue);
  if ("error" in found) return { error: found.error };
  const { payment, dueDate } = found;

  const amount = Number(formData.get("amount"));
  if (!amount || amount <= 0) return { error: "El monto debe ser mayor a 0." };

  // La tarjeta solo se marca: sus gastos ya están registrados.
  if (payment.type === "CREDIT_CARD") {
    await prisma.scheduledOccurrence.create({
      data: { scheduledPaymentId: payment.id, dueDate, status: "PAID", amount },
    });
    revalidateSchedule();
    return null;
  }

  const date = readOptionalDate(formData, "date");
  const paymentMethod = readText(formData, "paymentMethod");
  if (!date || date === "invalid") return { error: "La fecha no es válida." };
  if (!isPaymentMethod(paymentMethod)) return { error: "Elegí un método de pago." };

  const account = await findOwnAccount(userId, readText(formData, "accountId"));
  if (!account) return { error: "Elegí una cuenta." };
  if (!payment.categoryId) return { error: "El pago no tiene categoría." };
  const categoryId = payment.categoryId;

  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId,
        kind: "EXPENSE",
        amount,
        // El nombre del pago es el motivo, así se agrupa con los anteriores.
        reason: payment.name,
        date,
        paymentMethod,
      },
    });
    await tx.scheduledOccurrence.create({
      data: { scheduledPaymentId: payment.id, dueDate, status: "PAID", amount, transactionId: transaction.id },
    });
  });

  revalidateAll();
  return null;
}

export async function skipOccurrence(scheduledPaymentId: string, dueDateValue: string): Promise<ScheduleActionState> {
  const userId = await requireUserId();

  const found = await findPendingOccurrence(userId, scheduledPaymentId, dueDateValue);
  if ("error" in found) return { error: found.error };

  await prisma.scheduledOccurrence.create({
    data: { scheduledPaymentId: found.payment.id, dueDate: found.dueDate, status: "SKIPPED" },
  });

  revalidateSchedule();
  return null;
}

// Vuelve la cuota a pendiente. Si generó un gasto, se borra el gasto y la cuota
// cae con él (onDelete: Cascade).
export async function undoOccurrence(scheduledPaymentId: string, dueDateValue: string) {
  const userId = await requireUserId();

  const dueDate = parseDateOnly(dueDateValue);
  if (!dueDate) return;

  const occurrence = await prisma.scheduledOccurrence.findFirst({
    where: { scheduledPaymentId, dueDate, scheduledPayment: { userId } },
  });
  if (!occurrence) return;

  if (occurrence.transactionId) {
    await prisma.transaction.deleteMany({ where: { id: occurrence.transactionId, userId } });
    revalidateAll();
  } else {
    await prisma.scheduledOccurrence.delete({ where: { id: occurrence.id } });
    revalidateSchedule();
  }
}
