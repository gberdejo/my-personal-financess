import type { AccountType, TransactionKind } from "@/generated/prisma/client";

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
