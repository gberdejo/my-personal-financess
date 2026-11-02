"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import { formatCurrency, formatDate } from "@/lib/format";
import { isPaymentMethod, PREPAYMENT_MODE_LABELS } from "@/lib/labels";
import {
  extendDueDates,
  generateLoanSchedule,
  installmentNumbers,
  isPayableInstallment,
  LOAN_DATE_SHIFTS,
  overpaidInstallment,
  PREPAYMENT_MODES,
  rebuildSchedule,
  type GeneratedInstallment,
  type LoanDateShift,
  type LoanParams,
  type PrepaymentMode,
  type RebuildError,
} from "@/lib/loan";
import {
  defaultDisbursement,
  estimateRates,
  parseLoanCsv,
  summarizeImport,
  type ImportedInstallment,
} from "@/lib/loan-csv";
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

// Plazo y cuota base del cronograma recién generado.
function scheduleColumns(schedule: GeneratedInstallment[], params: LoanParams) {
  return {
    installments: schedule.length,
    baseInstallment: params.fixedInstallment ?? (schedule[1] ?? schedule[0]).total,
  };
}

// Fechas y cuota de referencia del pago programado, según sus cuotas a pagar.
async function syncPaymentDates(tx: Prisma.TransactionClient, scheduledPaymentId: string) {
  const installments = await tx.loanInstallment.findMany({
    where: { scheduledPaymentId, total: { gt: 0 } },
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

// Números provisorios al renumerar: lejos de los reales (que pueden ser 0 o
// negativos en las cuotas en 0 del inicio) para no chocar con la unicidad de
// (préstamo, número). Las cuotas recién importadas usan el doble.
const RENUMBER_OFFSET = 1_000_000;

function temporaryNumber(number: number) {
  return -(RENUMBER_OFFSET + number);
}

// Tras editar cuotas a mano: numera por fecha y recalcula el saldo de capital.
// Solo escribe las cuotas que cambian.
async function renumberAndRebalance(tx: Prisma.TransactionClient, scheduledPaymentId: string) {
  const loan = await tx.loan.findUniqueOrThrow({ where: { scheduledPaymentId }, select: { principal: true } });
  const installments = await tx.loanInstallment.findMany({
    where: { scheduledPaymentId },
    orderBy: { dueDate: "asc" },
    select: { id: true, number: true, principal: true, total: true, balance: true },
  });
  const numbers = installmentNumbers(installments.map((row) => ({ total: Number(row.total) })));

  let balance = Number(loan.principal);
  const changes = installments.flatMap((installment, i) => {
    balance = round2(balance - Number(installment.principal));
    const number = numbers[i];
    return installment.number !== number || Number(installment.balance) !== balance
      ? [{ id: installment.id, number, balance, renumber: installment.number !== number }]
      : [];
  });

  for (const change of changes.filter((c) => c.renumber)) {
    await tx.loanInstallment.update({ where: { id: change.id }, data: { number: temporaryNumber(change.number) } });
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

function rebuildErrorMessage(error: RebuildError) {
  return error.kind === "exceeds"
    ? `El prepago del ${formatDate(error.date)} es mayor que el saldo de capital a esa fecha (${formatCurrency(error.balance)}).`
    : `El prepago del ${formatDate(error.date)} queda después de la última cuota: el préstamo ya terminó.`;
}

// Día del mes de las cuotas: el más repetido (algunas se corren al lunes).
function usualDueDay(dates: Date[]) {
  const counts = new Map<number, number>();
  for (const date of dates) counts.set(date.getUTCDate(), (counts.get(date.getUTCDate()) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1;
}

// Rehace las cuotas que siguen a las primeras `keep` (por fecha) con la tasa y
// los seguros del préstamo, partiendo del saldo de la última conservada y
// aplicando los prepagos desde esa fecha. Si un prepago a plazo había quitado
// cuotas y ya no corresponde, vuelven hasta completar el plazo. No toca cuotas
// pagadas: si hay alguna después, falla.
async function rebuildAfter(tx: Prisma.TransactionClient, loan: Loan, keep: number) {
  const { scheduledPaymentId } = loan;
  const rows = await tx.loanInstallment.findMany({ where: { scheduledPaymentId }, orderBy: { dueDate: "asc" } });
  const kept = rows.slice(0, Math.max(0, keep));
  const following = rows.slice(kept.length);
  const last = kept.at(-1);

  const paid = await tx.scheduledOccurrence.count({
    where: { scheduledPaymentId, status: "PAID", dueDate: { in: following.map((row) => row.dueDate) } },
  });
  if (paid > 0) throw new Error("Hay cuotas pagadas después de esa fecha: no se pueden recalcular las siguientes.");

  const prepayments = await tx.loanPrepayment.findMany({
    where: { scheduledPaymentId },
    select: { date: true, amount: true, mode: true },
  });
  const events = prepayments.map((p) => ({ date: p.date, amount: Number(p.amount), mode: p.mode as PrepaymentMode }));

  const plazo = Math.max(loan.installments, rows.length);
  const lastDate = rows.at(-1)?.dueDate ?? loan.disbursementDate;
  const dueDates = [
    ...following.map((row) => row.dueDate),
    ...extendDueDates(lastDate, usualDueDay(rows.map((r) => r.dueDate)), plazo - rows.length, loan.dateShift as LoanDateShift),
  ];
  if (dueDates.length === 0) return;

  // Cuota vigente: la de la última cuota conservada si antes hubo un prepago a
  // cuota (que la cambió); si no, la cuota base del cronograma.
  const reducedBefore = last && events.some((e) => e.mode === "INSTALLMENT" && e.date <= last.dueDate);
  const installment =
    reducedBefore && last
      ? Number(last.total)
      : Number(loan.baseInstallment ?? loan.fixedInstallment ?? following[0]?.total ?? 0);

  const start = last
    ? { balance: Number(last.balance), date: last.dueDate, number: last.number + 1 }
    : { balance: Number(loan.principal), date: loan.disbursementDate, number: 1 };
  const result = rebuildSchedule(storedParams(loan), start, dueDates, installment, events);
  if ("error" in result) throw new Error(rebuildErrorMessage(result.error));
  const overpaid = overpaidInstallment(result.rows);
  if (overpaid) throw new Error(`Al recalcular, en la cuota ${overpaid} el saldo queda negativo. Revisá los montos.`);

  // Mismas fechas: se actualizan solo las que cambian. Sobran (prepago a plazo):
  // se borran. Faltan (se quitó un prepago a plazo): se crean.
  for (const [i, row] of result.rows.entries()) {
    const { number, dueDate, principal, interest, lifeInsurance, otherCharges, total, balance } = row;
    const current = following[i];
    if (!current) {
      await tx.loanInstallment.create({
        data: { scheduledPaymentId, number, dueDate, principal, interest, lifeInsurance, otherCharges, total, balance },
      });
      continue;
    }
    const unchanged =
      current.number === number &&
      Number(current.principal) === principal &&
      Number(current.interest) === interest &&
      Number(current.lifeInsurance) === lifeInsurance &&
      Number(current.otherCharges) === otherCharges &&
      Number(current.total) === total &&
      Number(current.balance) === balance;
    if (!unchanged) {
      await tx.loanInstallment.update({
        where: { id: current.id },
        data: { number, principal, interest, lifeInsurance, otherCharges, total, balance },
      });
    }
  }
  const leftover = following.slice(result.rows.length);
  if (leftover.length > 0) {
    const dates = leftover.map((row) => row.dueDate);
    await tx.scheduledOccurrence.deleteMany({ where: { scheduledPaymentId, dueDate: { in: dates } } });
    await tx.loanInstallment.deleteMany({ where: { id: { in: leftover.map((row) => row.id) } } });
  }
  await syncPaymentDates(tx, scheduledPaymentId);
}

// Cuántas cuotas (por fecha) quedan antes de `date`, contando la de ese mismo
// día: un prepago el día de una cuota se aplica después de pagarla.
async function installmentsUpTo(tx: Prisma.TransactionClient, scheduledPaymentId: string, date: Date) {
  return tx.loanInstallment.count({ where: { scheduledPaymentId, dueDate: { lte: date } } });
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
      loan: { create: { lender, ...loanColumns(params), ...scheduleColumns(schedule, params) } },
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

  try {
    await prisma.$transaction(async (tx) => {
      await tx.loanInstallment.deleteMany({ where: { scheduledPaymentId: payment.id } });
      await tx.loanInstallment.createMany({
        data: schedule.map((row) => ({ scheduledPaymentId: payment.id, ...row })),
      });
      const loan = await tx.loan.update({
        where: { scheduledPaymentId: payment.id },
        data: { ...loanColumns(result.params), ...scheduleColumns(schedule, result.params) },
      });
      await syncPaymentDates(tx, payment.id);
      // Los prepagos se vuelven a aplicar sobre el cronograma nuevo.
      const first = await tx.loanPrepayment.findFirst({
        where: { scheduledPaymentId: payment.id },
        orderBy: { date: "asc" },
      });
      if (first) await rebuildAfter(tx, loan, await installmentsUpTo(tx, payment.id, first.date));
    }, LONG_TRANSACTION);
  } catch (error) {
    if (error instanceof Error && !("code" in error)) return { error: error.message };
    throw error;
  }

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
        // Una cuota agregada a mano alarga el plazo.
        const count = await tx.loanInstallment.count({ where: { scheduledPaymentId: payment.id } });
        await tx.loan.update({ where: { scheduledPaymentId: payment.id }, data: { installments: Math.max(count, loan.installments) } });
      }
      await renumberAndRebalance(tx, payment.id);
      if (installmentId && recalculate) {
        const edited = await tx.loanInstallment.findUniqueOrThrow({ where: { id: installmentId } });
        await rebuildAfter(tx, loan, await installmentsUpTo(tx, payment.id, edited.dueDate));
      }
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
    // Quitar una cuota a mano acorta el plazo.
    await tx.loan.update({
      where: { scheduledPaymentId: payment.id },
      data: { installments: await tx.loanInstallment.count({ where: { scheduledPaymentId: payment.id } }) },
    });
    await renumberAndRebalance(tx, payment.id);
  }, LONG_TRANSACTION);

  revalidateLoans();
}

// ---------- Prepagos ----------

function revalidateWithTransactions() {
  revalidateLoans();
  revalidatePath("/dashboard/transacciones");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cuentas");
}

async function findOwnPrepayment(userId: string, prepaymentId: string) {
  return prisma.loanPrepayment.findFirst({
    where: { id: prepaymentId, scheduledPayment: { userId, type: "LOAN" } },
    include: { scheduledPayment: { include: { loan: true } } },
  });
}

// Alta (prepaymentId null) o edición de un prepago, planificado o hecho. Las
// cuotas siguientes se recalculan desde la fecha más temprana afectada.
export async function savePrepayment(
  scheduledPaymentId: string,
  prepaymentId: string | null,
  _prevState: LoanActionState,
  formData: FormData
): Promise<LoanActionState> {
  const userId = await requireUserId();

  const payment = await findOwnLoan(userId, scheduledPaymentId);
  if (!payment?.loan) return { error: "Préstamo inválido." };
  const loan = payment.loan;

  const date = parseDateOnly(readText(formData, "date"));
  const amount = readNumber(formData, "amount");
  const modeRaw = readText(formData, "mode");
  const note = readText(formData, "note") || null;

  if (!date) return { error: "La fecha no es válida." };
  if (date <= loan.disbursementDate) return { error: "El prepago tiene que ser después del desembolso." };
  if (!amount || amount <= 0) return { error: "El monto debe ser mayor a 0." };
  if (!(PREPAYMENT_MODES as string[]).includes(modeRaw)) return { error: "Elegí si reduce el plazo o la cuota." };
  const mode = modeRaw as PrepaymentMode;

  let previousDate: Date | null = null;
  if (prepaymentId) {
    const current = await prisma.loanPrepayment.findFirst({
      where: { id: prepaymentId, scheduledPaymentId: payment.id },
    });
    if (!current) return { error: "Prepago inválido." };
    // Ya tiene su gasto: cambiar el monto lo desalinearía.
    if (current.transactionId) return { error: "Deshacé el registro del prepago antes de editarlo." };
    previousDate = current.date;
  }

  const from = previousDate && previousDate < date ? previousDate : date;
  try {
    await prisma.$transaction(async (tx) => {
      const data = { date, amount: round2(amount), mode, note };
      if (prepaymentId) await tx.loanPrepayment.update({ where: { id: prepaymentId }, data });
      else await tx.loanPrepayment.create({ data: { scheduledPaymentId: payment.id, ...data } });
      await rebuildAfter(tx, loan, await installmentsUpTo(tx, payment.id, from));
    }, LONG_TRANSACTION);
  } catch (error) {
    if (error instanceof Error && !("code" in error)) return { error: error.message };
    throw error;
  }

  revalidateLoans();
  return null;
}

// Si estaba registrado, también se borra su gasto. Las cuotas se recalculan sin él.
export async function deletePrepayment(prepaymentId: string): Promise<LoanActionState> {
  const userId = await requireUserId();

  const prepayment = await findOwnPrepayment(userId, prepaymentId);
  const loan = prepayment?.scheduledPayment.loan;
  if (!prepayment || !loan) return { error: "Prepago inválido." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.loanPrepayment.delete({ where: { id: prepayment.id } });
      if (prepayment.transactionId) {
        await tx.transaction.deleteMany({ where: { id: prepayment.transactionId, userId } });
      }
      await rebuildAfter(tx, loan, await installmentsUpTo(tx, loan.scheduledPaymentId, prepayment.date));
    }, LONG_TRANSACTION);
  } catch (error) {
    if (error instanceof Error && !("code" in error)) return { error: error.message };
    throw error;
  }

  if (prepayment.transactionId) revalidateWithTransactions();
  else revalidateLoans();
  return null;
}

// Registra el gasto del prepago (las cuotas ya lo tienen en cuenta).
export async function registerPrepayment(
  prepaymentId: string,
  _prevState: LoanActionState,
  formData: FormData
): Promise<LoanActionState> {
  const userId = await requireUserId();

  const prepayment = await findOwnPrepayment(userId, prepaymentId);
  if (!prepayment) return { error: "Prepago inválido." };
  if (prepayment.transactionId) return { error: "Este prepago ya fue registrado." };
  const payment = prepayment.scheduledPayment;
  if (!payment.categoryId) return { error: "El préstamo no tiene categoría." };
  const categoryId = payment.categoryId;

  const date = parseDateOnly(readText(formData, "date"));
  const paymentMethod = readText(formData, "paymentMethod");
  const accountId = readText(formData, "accountId");
  if (!date) return { error: "La fecha no es válida." };
  if (!isPaymentMethod(paymentMethod)) return { error: "Elegí un método de pago." };
  const account = accountId
    ? await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } })
    : null;
  if (!account) return { error: "Elegí una cuenta." };

  const mode = prepayment.mode as PrepaymentMode;
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId,
        kind: "EXPENSE",
        amount: prepayment.amount,
        reason: payment.name,
        description: ["Prepago", PREPAYMENT_MODE_LABELS[mode].toLowerCase(), prepayment.note].filter(Boolean).join(" · "),
        date,
        paymentMethod,
      },
    });
    await tx.loanPrepayment.update({ where: { id: prepayment.id }, data: { transactionId: transaction.id } });
  });

  revalidateWithTransactions();
  return null;
}

// Borra el gasto; el prepago vuelve a planificado (sigue contando en las cuotas).
export async function undoPrepayment(prepaymentId: string) {
  const userId = await requireUserId();

  const prepayment = await findOwnPrepayment(userId, prepaymentId);
  if (!prepayment?.transactionId) return;

  await prisma.transaction.deleteMany({ where: { id: prepayment.transactionId, userId } });
  revalidateWithTransactions();
}

// ---------- Importar cronograma (CSV) ----------

// Lee y valida el CSV del formulario. Se vuelve a validar en el servidor aunque
// la vista previa ya lo haya hecho.
function readCsv(formData: FormData): { error: string } | { rows: ImportedInstallment[] } {
  const text = String(formData.get("csv") ?? "");
  if (!text.trim()) return { error: "Elegí el archivo CSV del cronograma." };
  const parsed = parseLoanCsv(text);
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    const more = parsed.errors.length > 1 ? ` (y ${parsed.errors.length - 1} más)` : "";
    return { error: `${first.line ? `Línea ${first.line}: ` : ""}${first.message}${more}` };
  }
  return { rows: parsed.rows };
}

function installmentData(row: ImportedInstallment, balanceFallback: number) {
  return {
    number: row.number,
    dueDate: row.dueDate,
    principal: row.principal,
    interest: row.interest,
    lifeInsurance: row.lifeInsurance,
    otherCharges: row.otherCharges,
    total: row.total,
    balance: row.balance ?? balanceFallback,
  };
}

// Saldo después de cada cuota cuando el archivo no lo trae: se descuenta el capital.
function fallbackBalances(rows: ImportedInstallment[], principal: number) {
  let balance = principal;
  return rows.map((row) => {
    balance = round2(balance - row.principal);
    return row.balance ?? balance;
  });
}

// Crea un préstamo con el cronograma del CSV tal cual (sin recalcular nada).
// TEA, monto y desembolso son opcionales: si faltan, se estiman del cronograma
// (sirven solo para recalcular si después se agrega un prepago).
export async function importLoan(_prevState: LoanActionState, formData: FormData): Promise<LoanActionState> {
  const userId = await requireUserId();

  const info = await readLoanInfo(userId, formData);
  if ("error" in info) return { error: info.error };
  const csv = readCsv(formData);
  if ("error" in csv) return { error: csv.error };
  const { rows } = csv;

  const summary = summarizeImport(rows);
  const principalInput = readNumber(formData, "principal");
  const teaInput = readNumber(formData, "teaPercent");
  const disbursementRaw = readText(formData, "disbursementDate");
  const disbursementDate = disbursementRaw ? parseDateOnly(disbursementRaw) : defaultDisbursement(rows[0].dueDate);
  if (principalInput === null) return { error: "El monto no es válido." };
  if (teaInput === null) return { error: "La TEA no es válida." };
  if (!disbursementDate) return { error: "La fecha de desembolso no es válida." };
  if (disbursementDate >= rows[0].dueDate) return { error: "El desembolso tiene que ser antes de la primera cuota." };

  const principal = principalInput || summary.principal || summary.total;
  const estimated = estimateRates(rows, 360);
  const balances = fallbackBalances(rows, principal);
  const numbers = installmentNumbers(rows);
  const payable = rows.filter(isPayableInstallment);
  const { lender, ...paymentInfo } = info.info;

  const payment = await prisma.scheduledPayment.create({
    data: {
      userId,
      type: "LOAN",
      ...paymentInfo,
      frequency: "MONTHLY",
      startDate: payable[0].dueDate,
      endDate: payable.at(-1)!.dueDate,
      amount: summary.installment,
      loan: {
        create: {
          lender,
          principal,
          tea: teaInput ? teaInput / 100 : (estimated.tea ?? 0),
          disbursementDate,
          dayBasis: 360,
          lifeInsuranceRate: estimated.lifeInsuranceRate,
          otherCharges: estimated.otherCharges,
          fixedInstallment: summary.installment,
          // Las fechas vienen del banco: no se corren.
          dateShift: "NONE",
          installments: rows.length,
          baseInstallment: summary.installment,
        },
      },
      installments: {
        create: rows.map((row, i) => ({ ...installmentData(row, balances[i]), number: numbers[i] })),
      },
    },
  });

  revalidateLoans();
  redirect(`/dashboard/prestamos/${payment.id}`);
}

// Numera por fecha sin tocar los saldos (los del banco no se recalculan).
async function renumberByDate(tx: Prisma.TransactionClient, scheduledPaymentId: string) {
  const installments = await tx.loanInstallment.findMany({
    where: { scheduledPaymentId },
    orderBy: { dueDate: "asc" },
    select: { id: true, number: true, total: true },
  });
  const numbers = installmentNumbers(installments.map((row) => ({ total: Number(row.total) })));
  const changes = installments.flatMap((row, i) =>
    row.number !== numbers[i] ? [{ id: row.id, number: numbers[i] }] : []
  );
  for (const change of changes) {
    await tx.loanInstallment.update({ where: { id: change.id }, data: { number: temporaryNumber(change.number) } });
  }
  for (const change of changes) {
    await tx.loanInstallment.update({ where: { id: change.id }, data: { number: change.number } });
  }
}

// Reemplaza las cuotas no pagadas con las del CSV (ej. el cronograma nuevo que
// da el banco después de un prepago). Las pagadas se conservan por fecha y
// ganan si el archivo trae esa misma fecha. No se recalcula nada: manda el CSV.
export async function importLoanSchedule(
  scheduledPaymentId: string,
  _prevState: LoanActionState,
  formData: FormData
): Promise<LoanActionState> {
  const userId = await requireUserId();

  const payment = await findOwnLoan(userId, scheduledPaymentId);
  if (!payment?.loan) return { error: "Préstamo inválido." };
  const csv = readCsv(formData);
  if ("error" in csv) return { error: csv.error };

  const paid = await prisma.scheduledOccurrence.findMany({
    where: { scheduledPaymentId: payment.id, status: "PAID" },
    select: { dueDate: true },
  });
  const paidTimes = new Set(paid.map((o) => o.dueDate.getTime()));
  const rows = csv.rows.filter((row) => !paidTimes.has(row.dueDate.getTime()));
  const summary = summarizeImport(csv.rows);
  const principal = paid.length === 0 && summary.principal > 0 ? summary.principal : Number(payment.loan.principal);
  const balances = fallbackBalances(csv.rows, principal);
  const balanceByTime = new Map(csv.rows.map((row, i) => [row.dueDate.getTime(), balances[i]]));

  try {
    await prisma.$transaction(async (tx) => {
      const keptPaid = await tx.loanInstallment.findMany({
        where: { scheduledPaymentId: payment.id, dueDate: { in: paid.map((o) => o.dueDate) } },
        select: { dueDate: true },
      });
      await tx.loanInstallment.deleteMany({
        where: { scheduledPaymentId: payment.id, dueDate: { notIn: keptPaid.map((row) => row.dueDate) } },
      });
      // Números provisorios para no chocar con los de las pagadas.
      await tx.loanInstallment.createMany({
        data: rows.map((row, i) => ({
          scheduledPaymentId: payment.id,
          ...installmentData(row, balanceByTime.get(row.dueDate.getTime()) ?? 0),
          number: -(2 * RENUMBER_OFFSET + i),
        })),
      });
      await renumberByDate(tx, payment.id);

      // Omitidas de fechas que ya no existen.
      const dates = await tx.loanInstallment.findMany({
        where: { scheduledPaymentId: payment.id },
        select: { dueDate: true },
      });
      await tx.scheduledOccurrence.deleteMany({
        where: { scheduledPaymentId: payment.id, status: "SKIPPED", dueDate: { notIn: dates.map((d) => d.dueDate) } },
      });

      await tx.loan.update({
        where: { scheduledPaymentId: payment.id },
        data: {
          principal,
          installments: dates.length,
          baseInstallment: summary.installment,
          fixedInstallment: summary.installment,
          dateShift: "NONE",
        },
      });
      await syncPaymentDates(tx, payment.id);
    }, LONG_TRANSACTION);
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "Hay dos cuotas con la misma fecha." };
    throw error;
  }

  revalidateLoans();
  return null;
}
