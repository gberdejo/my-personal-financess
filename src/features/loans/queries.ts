import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { shiftDay, todayInLima } from "@/lib/date";
import { getPaymentEntries, type CalendarEntry, type OccurrenceStatusView } from "@/features/schedule/queries";
import type { LoanDateShift } from "@/lib/loan";
import type { PaymentMethod, Prisma } from "@/generated/prisma/client";

const LOAN_INCLUDE = {
  loan: true,
  category: { select: { name: true } },
  account: { select: { name: true } },
  installments: { orderBy: { number: "asc" } },
  occurrences: { select: { dueDate: true, status: true, amount: true } },
} as const;

type LoadedLoan = Prisma.ScheduledPaymentGetPayload<{ include: typeof LOAN_INCLUDE }>;

export type LoanInstallmentRow = {
  id: string;
  number: number;
  dueDate: Date;
  principal: number;
  interest: number;
  lifeInsurance: number;
  otherCharges: number;
  total: number;
  balance: number;
  status: OccurrenceStatusView;
  // Lo pagado de verdad (puede diferir de la cuota).
  paidAmount: number | null;
};

export type LoanSummary = {
  id: string;
  name: string;
  lender: string | null;
  active: boolean;
  principal: number;
  // 0.096 = 9.6 %
  tea: number;
  installmentCount: number;
  paidCount: number;
  totalToPay: number;
  totalInterest: number;
  totalInsurance: number;
  paidSoFar: number;
  remainingToPay: number;
  // Saldo de capital después de la última cuota pagada.
  balance: number;
  next: { number: number; dueDate: Date; total: number; overdue: boolean } | null;
  lastDueDate: Date | null;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function buildRows(payment: LoadedLoan, today: Date): LoanInstallmentRow[] {
  const occurrenceByDue = new Map(payment.occurrences.map((o) => [o.dueDate.getTime(), o]));
  return payment.installments.map((i) => {
    const occurrence = occurrenceByDue.get(i.dueDate.getTime());
    return {
      id: i.id,
      number: i.number,
      dueDate: i.dueDate,
      principal: Number(i.principal),
      interest: Number(i.interest),
      lifeInsurance: Number(i.lifeInsurance),
      otherCharges: Number(i.otherCharges),
      total: Number(i.total),
      balance: Number(i.balance),
      status: occurrence?.status ?? (i.dueDate < today ? "OVERDUE" : "PENDING"),
      paidAmount: occurrence?.status === "PAID" ? Number(occurrence.amount ?? i.total) : null,
    };
  });
}

function summarize(payment: LoadedLoan, rows: LoanInstallmentRow[]): LoanSummary {
  const loan = payment.loan;
  const principal = Number(loan?.principal ?? 0);
  const paid = rows.filter((r) => r.status === "PAID");
  // Pendientes y vencidas; las omitidas no se cuentan como deuda por pagar.
  const open = rows.filter((r) => r.status === "PENDING" || r.status === "OVERDUE");
  const lastPaid = paid.reduce<LoanInstallmentRow | null>((last, r) => (!last || r.number > last.number ? r : last), null);
  const next = open[0];

  return {
    id: payment.id,
    name: payment.name,
    lender: loan?.lender ?? null,
    active: payment.active,
    principal,
    tea: Number(loan?.tea ?? 0),
    installmentCount: rows.length,
    paidCount: paid.length,
    totalToPay: round2(rows.reduce((sum, r) => sum + r.total, 0)),
    totalInterest: round2(rows.reduce((sum, r) => sum + r.interest, 0)),
    totalInsurance: round2(rows.reduce((sum, r) => sum + r.lifeInsurance + r.otherCharges, 0)),
    paidSoFar: round2(paid.reduce((sum, r) => sum + (r.paidAmount ?? r.total), 0)),
    remainingToPay: round2(open.reduce((sum, r) => sum + r.total, 0)),
    balance: lastPaid ? lastPaid.balance : principal,
    next: next ? { number: next.number, dueDate: next.dueDate, total: next.total, overdue: next.status === "OVERDUE" } : null,
    lastDueDate: rows.at(-1)?.dueDate ?? null,
  };
}

export async function getLoans(): Promise<LoanSummary[]> {
  const userId = await requireUserId();
  const today = todayInLima();

  const payments = await prisma.scheduledPayment.findMany({
    where: { userId, type: "LOAN" },
    include: LOAN_INCLUDE,
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
  return payments.map((payment) => summarize(payment, buildRows(payment, today)));
}

export type LoanDetail = {
  summary: LoanSummary;
  params: {
    lender: string | null;
    principal: number;
    tea: number;
    disbursementDate: Date;
    dayBasis: number;
    lifeInsuranceRate: number;
    otherCharges: number;
    fixedInstallment: number | null;
    dateShift: LoanDateShift;
  };
  payment: {
    categoryId: string | null;
    categoryName: string | null;
    accountId: string | null;
    accountName: string | null;
    paymentMethod: PaymentMethod | null;
  };
  rows: (LoanInstallmentRow & { entry: CalendarEntry | null })[];
};

export async function getLoan(scheduledPaymentId: string): Promise<LoanDetail | null> {
  const userId = await requireUserId();
  const today = todayInLima();

  const payment = await prisma.scheduledPayment.findFirst({
    where: { id: scheduledPaymentId, userId, type: "LOAN" },
    include: LOAN_INCLUDE,
  });
  if (!payment?.loan) return null;

  const rows = buildRows(payment, today);
  // Entradas de calendario de todas las cuotas, para pagarlas desde la tabla.
  const entries =
    rows.length > 0 ? await getPaymentEntries(payment.id, rows[0].dueDate, shiftDay(rows.at(-1)!.dueDate, 1)) : [];
  const entryByDue = new Map(entries.map((e) => [e.dueDate.getTime(), e]));
  const loan = payment.loan;

  return {
    summary: summarize(payment, rows),
    params: {
      lender: loan.lender,
      principal: Number(loan.principal),
      tea: Number(loan.tea),
      disbursementDate: loan.disbursementDate,
      dayBasis: loan.dayBasis,
      lifeInsuranceRate: Number(loan.lifeInsuranceRate),
      otherCharges: Number(loan.otherCharges),
      fixedInstallment: loan.fixedInstallment != null ? Number(loan.fixedInstallment) : null,
      dateShift: loan.dateShift as LoanDateShift,
    },
    payment: {
      categoryId: payment.categoryId,
      categoryName: payment.category?.name ?? null,
      accountId: payment.accountId,
      accountName: payment.account?.name ?? null,
      paymentMethod: payment.paymentMethod,
    },
    rows: rows.map((row) => ({ ...row, entry: entryByDue.get(row.dueDate.getTime()) ?? null })),
  };
}
