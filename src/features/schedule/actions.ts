"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import { formatCurrency } from "@/lib/format";
import { isPaymentMethod, isScheduleFrequency, MONTH_NAMES } from "@/lib/labels";
import { billingMonth, monthIndex, monthStart, periodsByMonth, ruleBillingMonth } from "@/lib/schedule";
import type { PaymentMethod, ScheduledPaymentType, ScheduleFrequency } from "@/generated/prisma/client";
import { freezeRuleMonthsWithData, isDueDateOf, moveDueDate } from "./periods";

export type ScheduleActionState = { error?: string } | null;

function revalidateSchedule() {
  revalidatePath("/dashboard/calendario", "layout");
  // Las cuotas de préstamos se pagan desde el calendario.
  revalidatePath("/dashboard/prestamos", "layout");
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

const DAY_MS = 24 * 60 * 60 * 1000;
// Los bancos pagan entre 2 y 4 semanas después del cierre; más es casi seguro un error.
const MAX_DAYS_CLOSING_TO_DUE = 62;

function validatePeriod(closingDate: Date, dueDate: Date) {
  if (dueDate <= closingDate) return "La fecha de pago tiene que ser después del cierre.";
  if ((dueDate.getTime() - closingDate.getTime()) / DAY_MS > MAX_DAYS_CLOSING_TO_DUE) {
    return "La fecha de pago tiene que caer dentro de los 2 meses siguientes al cierre.";
  }
  return null;
}

// Si dos meses terminan con la misma fecha, la base rechaza el cambio por unicidad.
function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
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
  dueDay: number | null;
};

type FormPeriod = { closingDate: Date; dueDate: Date };

// Valida el formulario de un pago programado. En tarjetas, las fechas de cierre y
// pago son las del próximo estado de cuenta: definen la regla para los meses sin
// cronograma y se guardan como un mes del cronograma. `currentStartDate` (al
// editar) se conserva salvo que el nuevo pago sea anterior.
async function readPaymentForm(
  userId: string,
  formData: FormData,
  type: ScheduledPaymentType,
  currentStartDate?: Date
): Promise<{ error: string } | { data: PaymentData; period: FormPeriod | null }> {
  const name = readText(formData, "name");
  if (!name) return { error: "El nombre es obligatorio." };

  const accountId = readText(formData, "accountId");
  const account = await findOwnAccount(userId, accountId);
  if (accountId && !account) return { error: "Cuenta inválida." };

  const methodRaw = readText(formData, "paymentMethod");
  if (methodRaw && !isPaymentMethod(methodRaw)) return { error: "Método de pago inválido." };
  const paymentMethod = methodRaw && isPaymentMethod(methodRaw) ? methodRaw : null;

  if (type === "CREDIT_CARD") {
    const closingDate = readOptionalDate(formData, "closingDate");
    const dueDate = readOptionalDate(formData, "dueDate");
    if (!closingDate || closingDate === "invalid") return { error: "La fecha de cierre no es válida." };
    if (!dueDate || dueDate === "invalid") return { error: "La fecha de pago no es válida." };
    const periodError = validatePeriod(closingDate, dueDate);
    if (periodError) return { error: periodError };

    const startDate = currentStartDate && currentStartDate <= dueDate ? currentStartDate : dueDate;

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
        closingDay: closingDate.getUTCDate(),
        dueDay: dueDate.getUTCDate(),
      },
      period: { closingDate, dueDate },
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
      dueDay: null,
    },
    period: null,
  };
}

function periodMonth(period: FormPeriod) {
  return monthStart(monthIndex(period.closingDate));
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

  const { period } = result;
  await prisma.scheduledPayment.create({
    data: {
      userId,
      ...result.data,
      billingPeriods: period ? { create: { month: periodMonth(period), ...period } } : undefined,
    },
  });

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
  // Los préstamos se editan desde su página (cronograma de cuotas).
  if (payment.type === "LOAN") return { error: "Editá el préstamo desde Préstamos." };

  const result = await readPaymentForm(userId, formData, payment.type, payment.startDate);
  if ("error" in result) return { error: result.error };

  const { period } = result;
  const oldRule =
    payment.closingDay && payment.dueDay
      ? { startDate: payment.startDate, closingDay: payment.closingDay, dueDay: payment.dueDay }
      : null;

  try {
    await prisma.$transaction(async (tx) => {
      if (period) {
        // Los meses de la regla vieja con datos pasan al cronograma antes de cambiarla.
        if (oldRule) await freezeRuleMonthsWithData(tx, payment.id, oldRule);

        const month = periodMonth(period);
        const where = { scheduledPaymentId_month: { scheduledPaymentId: payment.id, month } };
        const existing = await tx.cardBillingPeriod.findUnique({ where });
        if (existing) await moveDueDate(tx, payment.id, existing.dueDate, period.dueDate);
        await tx.cardBillingPeriod.upsert({
          where,
          create: { scheduledPaymentId: payment.id, month, ...period },
          update: period,
        });
      }
      await tx.scheduledPayment.update({
        where: { id: payment.id },
        data: { ...result.data, active: formData.get("active") === "on" },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "Esa fecha de pago ya la usa otro mes de la tarjeta." };
    throw error;
  }

  revalidateSchedule();
  return null;
}

// ---------- Cronograma de facturación ----------

// Guarda los 12 meses de un año. Cada mes lleva `closing-<m>` y `due-<m>`
// (m = 0–11); un mes vacío vuelve a la regla. Lo que colgaba de un vencimiento
// (pago, deuda, ruleteos) se mueve a su nueva fecha.
export async function saveBillingSchedule(
  scheduledPaymentId: string,
  year: number,
  _prevState: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const userId = await requireUserId();

  const payment = await prisma.scheduledPayment.findFirst({
    where: { id: scheduledPaymentId, userId, type: "CREDIT_CARD" },
  });
  if (!payment?.closingDay || !payment.dueDay) return { error: "Tarjeta inválida." };
  const rule = { startDate: payment.startDate, closingDay: payment.closingDay, dueDay: payment.dueDay };

  const rows: (FormPeriod | null)[] = [];
  for (let m = 0; m < 12; m++) {
    const closingDate = readOptionalDate(formData, `closing-${m}`);
    const dueDate = readOptionalDate(formData, `due-${m}`);
    const name = MONTH_NAMES[m];
    if (!closingDate && !dueDate) {
      rows.push(null);
      continue;
    }
    if (!closingDate || closingDate === "invalid") return { error: `Falta el cierre de ${name}.` };
    if (!dueDate || dueDate === "invalid") return { error: `Falta la fecha de pago de ${name}.` };
    if (monthIndex(closingDate) !== year * 12 + m) return { error: `El cierre de ${name} tiene que caer en ${name}.` };
    const periodError = validatePeriod(closingDate, dueDate);
    if (periodError) return { error: `${name}: ${periodError}` };
    rows.push({ closingDate, dueDate });
  }

  const filled = rows.filter((row): row is FormPeriod => row !== null);
  for (let i = 1; i < filled.length; i++) {
    if (filled[i].dueDate <= filled[i - 1].dueDate) return { error: "Las fechas de pago tienen que ir en orden." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const first = year * 12;
      const existing = await tx.cardBillingPeriod.findMany({
        where: { scheduledPaymentId: payment.id, month: { gte: monthStart(first), lt: monthStart(first + 12) } },
        select: { closingDate: true, dueDate: true },
      });
      const byMonth = periodsByMonth(existing);

      for (let m = 0; m < 12; m++) {
        const index = first + m;
        const month = monthStart(index);
        const row = rows[m];
        const where = { scheduledPaymentId_month: { scheduledPaymentId: payment.id, month } };

        if (row) {
          await moveDueDate(tx, payment.id, billingMonth(rule, byMonth, index).dueDate, row.dueDate);
          await tx.cardBillingPeriod.upsert({
            where,
            create: { scheduledPaymentId: payment.id, month, ...row },
            update: row,
          });
        } else if (byMonth.has(index)) {
          await moveDueDate(tx, payment.id, byMonth.get(index)!.dueDate, ruleBillingMonth(rule, index).dueDate);
          await tx.cardBillingPeriod.delete({ where });
        }
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "Hay dos meses con la misma fecha de pago." };
    throw error;
  }

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

// "Cuota 5/180 · capital S/ 539.11 · interés S/ 1,524.23 · seguros S/ 137.16"
async function installmentDescription(scheduledPaymentId: string, dueDate: Date) {
  const [installment, count] = await Promise.all([
    prisma.loanInstallment.findUnique({
      where: { scheduledPaymentId_dueDate: { scheduledPaymentId, dueDate } },
    }),
    prisma.loanInstallment.count({ where: { scheduledPaymentId } }),
  ]);
  if (!installment) return null;
  const insurance = Number(installment.lifeInsurance) + Number(installment.otherCharges);
  return [
    `Cuota ${installment.number}/${count}`,
    `capital ${formatCurrency(Number(installment.principal))}`,
    `interés ${formatCurrency(Number(installment.interest))}`,
    insurance > 0 ? `seguros ${formatCurrency(insurance)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

async function findPendingOccurrence(userId: string, scheduledPaymentId: string, dueDateValue: string) {
  const payment = await findOwnPayment(userId, scheduledPaymentId);
  if (!payment) return { error: "Pago inválido." } as const;

  const dueDate = parseDateOnly(dueDateValue);
  if (!dueDate || !(await isDueDateOf(payment, dueDate))) return { error: "Fecha de vencimiento inválida." } as const;

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

  // La tarjeta solo se marca: sus gastos ya están registrados. Lo mismo si el
  // pago ya se cargó en Transacciones (ej. cuotas de un préstamo ya en curso).
  if (payment.type === "CREDIT_CARD" || formData.get("markOnly") === "on") {
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
  const description = payment.type === "LOAN" ? await installmentDescription(payment.id, dueDate) : null;

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
        description,
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
