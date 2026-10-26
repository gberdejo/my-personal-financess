"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import { isPaymentMethod } from "@/lib/labels";
import {
  generateLoanSchedule,
  LOAN_DATE_SHIFTS,
  overpaidInstallment,
  recalculateFollowing,
  type LoanDateShift,
  type LoanParams,
} from "@/lib/loan";
import { moveDueDate } from "@/features/schedule/periods";
import type { Loan, PaymentMethod, Prisma } from "@/generated/prisma/client";

export type LoanActionState = { error?: string } | null;

// Tope de cuotas: 40 años mensuales.
const MAX_INSTALLMENTS = 480;

function revalidateLoans() {
  revalidatePath("/dashboard/prestamos", "layout");
  revalidatePath("/dashboard/calendario", "layout");
}

function readText(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

// Montos y tasas opcionales: vacío = 0. `null` si no es un número válido.
function readNumber(formData: FormData, field: string, { min = 0 }: { min?: number } = {}) {
  const raw = readText(formData, field);
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min ? value : null;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

// Nombre, entidad, categoría, cuenta y método del préstamo.
async function readLoanInfo(userId: string, formData: FormData) {
  const name = readText(formData, "name");
  if (!name) return { error: "El nombre es obligatorio." } as const;

  const category = await prisma.category.findFirst({
    where: { id: readText(formData, "categoryId"), kind: "EXPENSE", OR: [{ userId: null }, { userId }] },
    select: { id: true },
  });
  if (!category) return { error: "Elegí una categoría para el gasto de las cuotas." } as const;

  const accountId = readText(formData, "accountId");
  const account = accountId
    ? await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } })
    : null;
  if (accountId && !account) return { error: "Cuenta inválida." } as const;

  const methodRaw = readText(formData, "paymentMethod");
  if (methodRaw && !isPaymentMethod(methodRaw)) return { error: "Método de pago inválido." } as const;
  const paymentMethod: PaymentMethod | null = methodRaw && isPaymentMethod(methodRaw) ? methodRaw : null;

  return {
    info: {
      name,
      lender: readText(formData, "lender") || null,
      categoryId: category.id,
      accountId: account?.id ?? null,
      paymentMethod,
    },
  } as const;
}

// Parámetros para generar el cronograma. Las tasas llegan en % (9.6 → 0.096).
function readLoanParams(formData: FormData): { error: string } | { params: LoanParams } {
  const principal = readNumber(formData, "principal");
  const teaPercent = readNumber(formData, "teaPercent");
  const installments = Number(readText(formData, "installments"));
  const disbursementDate = parseDateOnly(readText(formData, "disbursementDate"));
  const firstDueDate = parseDateOnly(readText(formData, "firstDueDate"));
  const lifePercent = readNumber(formData, "lifeInsurancePercent");
  const otherCharges = readNumber(formData, "otherCharges");
  const fixedRaw = readText(formData, "fixedInstallment");
  const fixedInstallment = fixedRaw ? Number(fixedRaw) : null;
  const dayBasis = Number(readText(formData, "dayBasis")) === 365 ? 365 : 360;
  const dateShiftRaw = readText(formData, "dateShift");
  const dateShift = (LOAN_DATE_SHIFTS as string[]).includes(dateShiftRaw) ? (dateShiftRaw as LoanDateShift) : "NONE";

  if (!principal || principal <= 0) return { error: "El monto del préstamo debe ser mayor a 0." };
  if (teaPercent === null || teaPercent > 200) return { error: "La TEA no es válida." };
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) {
    return { error: `El número de cuotas debe estar entre 1 y ${MAX_INSTALLMENTS}.` };
  }
  if (!disbursementDate) return { error: "La fecha de desembolso no es válida." };
  if (!firstDueDate) return { error: "La fecha de la primera cuota no es válida." };
  if (firstDueDate <= disbursementDate) return { error: "La primera cuota tiene que ser después del desembolso." };
  if (lifePercent === null || lifePercent > 5) return { error: "El seguro de desgravamen no es válido." };
  if (otherCharges === null) return { error: "Los otros cargos no son válidos." };
  if (fixedInstallment !== null && !(fixedInstallment > 0)) return { error: "La cuota fija debe ser mayor a 0." };

  return {
    params: {
      principal: round2(principal),
      tea: teaPercent / 100,
      installments,
      disbursementDate,
      firstDueDate,
      dayBasis,
      lifeInsuranceRate: lifePercent / 100,
      otherCharges: round2(otherCharges),
      fixedInstallment: fixedInstallment !== null ? round2(fixedInstallment) : null,
      dateShift,
    },
  };
}

function overpaidError(schedule: ReturnType<typeof generateLoanSchedule>) {
  const number = overpaidInstallment(schedule);
  return number
    ? `Con estos datos la deuda se termina de pagar antes: en la cuota ${number} el saldo queda negativo. Revisá la fecha de desembolso, la TEA o la cuota fija.`
    : null;
}

function loanColumns(params: LoanParams) {
  return {
    principal: params.principal,
    tea: params.tea,
    disbursementDate: params.disbursementDate,
    dayBasis: params.dayBasis,
    lifeInsuranceRate: params.lifeInsuranceRate,
    otherCharges: params.otherCharges,
    fixedInstallment: params.fixedInstallment,
    dateShift: params.dateShift,
  };
}

// Fechas y cuota de referencia del pago programado, según sus cuotas.
async function syncPaymentDates(tx: Prisma.TransactionClient, scheduledPaymentId: string) {
  const installments = await tx.loanInstallment.findMany({
    where: { scheduledPaymentId },
    orderBy: { dueDate: "asc" },
    select: { dueDate: true, total: true },
  });
  if (installments.length === 0) return;
  await tx.scheduledPayment.update({
    where: { id: scheduledPaymentId },
    data: {
      startDate: installments[0].dueDate,
      endDate: installments.at(-1)!.dueDate,
      // La cuota "típica": la segunda si existe (la primera suele tener días de gracia).
      amount: (installments[1] ?? installments[0]).total,
    },
  });
}

// Un préstamo puede tener cientos de cuotas: las transacciones que las tocan
// una por una necesitan más que los 5 s por defecto de Prisma.
const LONG_TRANSACTION = { timeout: 60_000, maxWait: 10_000 };

// Tras editar cuotas a mano: numera por fecha y recalcula el saldo de capital.
// Solo escribe las cuotas que cambian.
async function renumberAndRebalance(tx: Prisma.TransactionClient, scheduledPaymentId: string) {
  const loan = await tx.loan.findUniqueOrThrow({ where: { scheduledPaymentId }, select: { principal: true } });
  const installments = await tx.loanInstallment.findMany({
    where: { scheduledPaymentId },
    orderBy: { dueDate: "asc" },
    select: { id: true, number: true, principal: true, balance: true },
  });

  let balance = Number(loan.principal);
  const changes = installments.flatMap((installment, i) => {
    balance = round2(balance - Number(installment.principal));
    const number = i + 1;
    return installment.number !== number || Number(installment.balance) !== balance
      ? [{ id: installment.id, number, balance, renumber: installment.number !== number }]
      : [];
  });

  // Los que cambian de número pasan primero por un número negativo para no
  // chocar con la unicidad de (préstamo, número).
  for (const change of changes.filter((c) => c.renumber)) {
    await tx.loanInstallment.update({ where: { id: change.id }, data: { number: -change.number } });
  }
  for (const change of changes) {
    await tx.loanInstallment.update({
      where: { id: change.id },
      data: { number: change.number, balance: change.balance },
    });
  }
  await syncPaymentDates(tx, scheduledPaymentId);
}

function storedParams(loan: Loan): LoanParams {
  return {
    principal: Number(loan.principal),
    tea: Number(loan.tea),
    // Plazo y primera fecha no se usan al recalcular: las fechas ya existen.
    installments: 0,
    disbursementDate: loan.disbursementDate,
    firstDueDate: loan.disbursementDate,
    dayBasis: loan.dayBasis,
    lifeInsuranceRate: Number(loan.lifeInsuranceRate),
    otherCharges: Number(loan.otherCharges),
    fixedInstallment: loan.fixedInstallment != null ? Number(loan.fixedInstallment) : null,
    dateShift: loan.dateShift as LoanDateShift,
  };
}

// Rehace las cuotas posteriores a `installmentId` con la tasa del préstamo,
// partiendo del saldo que dejó esa cuota. No toca cuotas ya pagadas.
async function recalculateAfter(tx: Prisma.TransactionClient, loan: Loan, installmentId: string) {
  const { scheduledPaymentId } = loan;
  const rows = await tx.loanInstallment.findMany({ where: { scheduledPaymentId }, orderBy: { dueDate: "asc" } });
  const index = rows.findIndex((row) => row.id === installmentId);
  const following = rows.slice(index + 1);
  if (index < 0 || following.length === 0) return;

  const paid = await tx.scheduledOccurrence.count({
    where: { scheduledPaymentId, status: "PAID", dueDate: { in: following.map((row) => row.dueDate) } },
  });
  if (paid > 0) throw new Error("Hay cuotas pagadas después de esta: no se pueden recalcular las siguientes.");

  const params = storedParams(loan);
  const edited = rows[index];
  const recalculated = recalculateFollowing(
    params,
    { number: edited.number, dueDate: edited.dueDate, balance: Number(edited.balance) },
    following.map((row) => row.dueDate),
    params.fixedInstallment ?? Number(following[0].total)
  );
  const overpaid = overpaidInstallment(recalculated);
  if (overpaid) throw new Error(`Al recalcular, en la cuota ${overpaid} el saldo queda negativo. Revisá los montos.`);

  for (const [i, row] of recalculated.entries()) {
    const { principal, interest, lifeInsurance, otherCharges, total, balance } = row;
    await tx.loanInstallment.update({
      where: { id: following[i].id },
      data: { principal, interest, lifeInsurance, otherCharges, total, balance },
    });
  }
  await syncPaymentDates(tx, scheduledPaymentId);
}

async function findOwnLoan(userId: string, scheduledPaymentId: string) {
  return prisma.scheduledPayment.findFirst({
    where: { id: scheduledPaymentId, userId, type: "LOAN" },
    include: { loan: true },
  });
}

// ---------- Préstamo ----------

export async function createLoan(_prevState: LoanActionState, formData: FormData): Promise<LoanActionState> {
  const userId = await requireUserId();

  const info = await readLoanInfo(userId, formData);
  if ("error" in info) return { error: info.error };
  const result = readLoanParams(formData);
  if ("error" in result) return { error: result.error };
  const { params } = result;

  const schedule = generateLoanSchedule(params);
  const scheduleError = overpaidError(schedule);
  if (scheduleError) return { error: scheduleError };
  const { lender, ...paymentInfo } = info.info;

  const payment = await prisma.scheduledPayment.create({
    data: {
      userId,
      type: "LOAN",
      ...paymentInfo,
      frequency: "MONTHLY",
      startDate: schedule[0].dueDate,
      endDate: schedule.at(-1)!.dueDate,
      amount: (schedule[1] ?? schedule[0]).total,
      loan: { create: { lender, ...loanColumns(params) } },
      installments: { create: schedule },
    },
  });

  revalidateLoans();
  redirect(`/dashboard/prestamos/${payment.id}`);
}

// Datos que no cambian el cronograma.
export async function updateLoanInfo(
  scheduledPaymentId: string,
  _prevState: LoanActionState,
  formData: FormData
): Promise<LoanActionState> {
  const userId = await requireUserId();

  const payment = await findOwnLoan(userId, scheduledPaymentId);
  if (!payment?.loan) return { error: "No se pudo actualizar el préstamo." };
  const info = await readLoanInfo(userId, formData);
  if ("error" in info) return { error: info.error };
  const { lender, ...paymentInfo } = info.info;

  await prisma.scheduledPayment.update({
    where: { id: payment.id },
    data: {
      ...paymentInfo,
      active: formData.get("active") === "on",
      loan: { update: { lender } },
    },
  });

  revalidateLoans();
  return null;
}

// Rehace el cronograma con nuevos parámetros. Solo si ninguna cuota se pagó u
// omitió: esas cuotas ya tienen historia que no se debe reescribir.
export async function regenerateLoanSchedule(
  scheduledPaymentId: string,
  _prevState: LoanActionState,
  formData: FormData
): Promise<LoanActionState> {
  const userId = await requireUserId();

  const payment = await findOwnLoan(userId, scheduledPaymentId);
  if (!payment?.loan) return { error: "Préstamo inválido." };
  const resolved = await prisma.scheduledOccurrence.count({ where: { scheduledPaymentId: payment.id } });
  if (resolved > 0) {
    return { error: "Ya hay cuotas pagadas u omitidas: editá las cuotas que faltan una por una." };
  }

  const result = readLoanParams(formData);
  if ("error" in result) return { error: result.error };
  const schedule = generateLoanSchedule(result.params);
  const scheduleError = overpaidError(schedule);
  if (scheduleError) return { error: scheduleError };

  await prisma.$transaction(async (tx) => {
    await tx.loanInstallment.deleteMany({ where: { scheduledPaymentId: payment.id } });
    await tx.loanInstallment.createMany({
      data: schedule.map((row) => ({ scheduledPaymentId: payment.id, ...row })),
    });
    await tx.loan.update({ where: { scheduledPaymentId: payment.id }, data: loanColumns(result.params) });
    await syncPaymentDates(tx, payment.id);
  });

  revalidateLoans();
  return null;
}

// Las transacciones de las cuotas ya pagadas se conservan.
export async function deleteLoan(scheduledPaymentId: string) {
  const userId = await requireUserId();
  await prisma.scheduledPayment.deleteMany({ where: { id: scheduledPaymentId, userId, type: "LOAN" } });
  revalidateLoans();
  redirect("/dashboard/prestamos");
}

// ---------- Cuotas ----------

// Alta (installmentId null) o edición de una cuota a mano. La cuota es la suma
// de sus partes; el número y el saldo se recalculan por fecha. Con
// `recalculateFollowing`, las cuotas siguientes se rehacen desde su saldo.
export async function saveLoanInstallment(
  scheduledPaymentId: string,
  installmentId: string | null,
  _prevState: LoanActionState,
  formData: FormData
): Promise<LoanActionState> {
  const userId = await requireUserId();

  const payment = await findOwnLoan(userId, scheduledPaymentId);
  if (!payment?.loan) return { error: "Préstamo inválido." };

  const dueDate = parseDateOnly(readText(formData, "dueDate"));
  // El capital puede ser negativo (periodo de gracia).
  const principal = Number(readText(formData, "principal") || "0");
  const interest = readNumber(formData, "interest");
  const lifeInsurance = readNumber(formData, "lifeInsurance");
  const otherCharges = readNumber(formData, "otherCharges");

  if (!dueDate) return { error: "La fecha no es válida." };
  if (dueDate <= payment.loan.disbursementDate) return { error: "La cuota tiene que ser después del desembolso." };
  if (!Number.isFinite(principal)) return { error: "El capital no es válido." };
  if (interest === null || lifeInsurance === null || otherCharges === null) {
    return { error: "Interés, seguro y otros cargos no pueden ser negativos." };
  }
  const total = round2(principal + interest + lifeInsurance + otherCharges);
  if (total <= 0) return { error: "La cuota debe ser mayor a 0." };

  const data = {
    dueDate,
    principal: round2(principal),
    interest: round2(interest),
    lifeInsurance: round2(lifeInsurance),
    otherCharges: round2(otherCharges),
    total,
  };

  const loan = payment.loan;
  const recalculate = formData.get("recalculateFollowing") === "on";

  try {
    await prisma.$transaction(async (tx) => {
      if (installmentId) {
        const current = await tx.loanInstallment.findFirst({
          where: { id: installmentId, scheduledPaymentId: payment.id },
        });
        if (!current) throw new Error("Cuota inválida.");
        const resolved = await tx.scheduledOccurrence.findUnique({
          where: { scheduledPaymentId_dueDate: { scheduledPaymentId: payment.id, dueDate: current.dueDate } },
          select: { status: true },
        });
        if (resolved?.status === "PAID") throw new Error("Esta cuota ya está pagada: deshacé el pago para editarla.");
        await moveDueDate(tx, payment.id, current.dueDate, dueDate);
        await tx.loanInstallment.update({ where: { id: current.id }, data });
      } else {
        // Número provisorio: renumberAndRebalance lo corrige por fecha.
        const last = await tx.loanInstallment.aggregate({
          where: { scheduledPaymentId: payment.id },
          _max: { number: true },
        });
        await tx.loanInstallment.create({
          data: { scheduledPaymentId: payment.id, number: (last._max.number ?? 0) + 1, balance: 0, ...data },
        });
      }
      await renumberAndRebalance(tx, payment.id);
      if (installmentId && recalculate) await recalculateAfter(tx, loan, installmentId);
    }, LONG_TRANSACTION);
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "Ya hay otra cuota con esa fecha." };
    if (error instanceof Error && !("code" in error)) return { error: error.message };
    throw error;
  }

  revalidateLoans();
  return null;
}

export async function deleteLoanInstallment(scheduledPaymentId: string, installmentId: string) {
  const userId = await requireUserId();

  const payment = await findOwnLoan(userId, scheduledPaymentId);
  if (!payment) return;
  const installment = await prisma.loanInstallment.findFirst({
    where: { id: installmentId, scheduledPaymentId: payment.id },
  });
  if (!installment) return;
  const resolved = await prisma.scheduledOccurrence.findUnique({
    where: { scheduledPaymentId_dueDate: { scheduledPaymentId: payment.id, dueDate: installment.dueDate } },
    select: { status: true },
  });
  // Una cuota pagada tiene su gasto: hay que deshacer el pago primero.
  if (resolved?.status === "PAID") return;

  await prisma.$transaction(async (tx) => {
    await tx.scheduledOccurrence.deleteMany({
      where: { scheduledPaymentId: payment.id, dueDate: installment.dueDate },
    });
    await tx.loanInstallment.delete({ where: { id: installment.id } });
    await renumberAndRebalance(tx, payment.id);
  }, LONG_TRANSACTION);

  revalidateLoans();
}
