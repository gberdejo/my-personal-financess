import type { AccountType, BudgetTemplate, TransactionKind } from "@/generated/prisma/client";

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

export const BUDGET_TEMPLATE_LABELS: Record<BudgetTemplate, string> = {
  PARTY: "Fiesta",
  EVENT: "Evento",
  CONSTRUCTION: "Construcción",
  TRIP: "Viaje",
  SHOPPING: "Compras",
  BLANK: "En blanco",
};
