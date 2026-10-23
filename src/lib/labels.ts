import type {
  AccountType,
  BudgetTemplate,
  PaymentMethod,
  ScheduledPaymentType,
  ScheduleFrequency,
  TransactionKind,
} from "@/generated/prisma/client";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: "Efectivo",
  BANK: "Banco",
  CREDIT_CARD: "Tarjeta de crédito",
  INVESTMENT: "Inversión",
};

export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = {
  INCOME: "Ingreso",
  EXPENSE: "Gasto",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CREDIT_CARD: "Tarjeta de crédito",
  DEBIT_CARD: "Tarjeta de débito",
  YAPE: "Yape",
  PLIN: "Plin",
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
};

// Orden en que se muestran en selectores y filtros.
export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

export function isPaymentMethod(value: string): value is PaymentMethod {
  return Object.hasOwn(PAYMENT_METHOD_LABELS, value);
}

// Gastos registrados antes de existir el campo.
export const NO_PAYMENT_METHOD_LABEL = "Sin método";

export const BUDGET_TEMPLATE_LABELS: Record<BudgetTemplate, string> = {
  PARTY: "Fiesta",
  EVENT: "Evento",
  CONSTRUCTION: "Construcción",
  TRIP: "Viaje",
  SHOPPING: "Compras",
  BLANK: "En blanco",
};

export const SCHEDULED_PAYMENT_TYPE_LABELS: Record<ScheduledPaymentType, string> = {
  BILL: "Servicio o gasto",
  CREDIT_CARD: "Tarjeta de crédito",
};

export const SCHEDULE_FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  ONCE: "Una sola vez",
  WEEKLY: "Semanal",
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  YEARLY: "Anual",
};

export const SCHEDULE_FREQUENCIES = Object.keys(SCHEDULE_FREQUENCY_LABELS) as ScheduleFrequency[];

export function isScheduleFrequency(value: string): value is ScheduleFrequency {
  return Object.hasOwn(SCHEDULE_FREQUENCY_LABELS, value);
}

// Estado de una operación de ruleteo (ver features/roulette/queries.ts).
export const ROULETTE_STATUS_LABELS: Record<"PLANNED" | "DUE" | "DONE", string> = {
  PLANNED: "Planificada",
  DUE: "Atrasada",
  DONE: "Registrada",
};

export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
