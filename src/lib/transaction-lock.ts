import { toUTCDateInputValue } from "@/lib/date";

// Gastos cuyo monto no se edita desde Transacciones: el de un prepago rehace
// el cronograma del préstamo y el de una comisión sale del cálculo del
// ruleteo. Se cambian desde su pantalla (o deshaciendo el registro).
export type AmountLock = "PREPAYMENT" | "ROULETTE";

export const AMOUNT_LOCK_LABELS: Record<AmountLock, string> = {
  PREPAYMENT: "Es el gasto de un prepago: el monto se cambia desde el préstamo.",
  ROULETTE: "Es la comisión de un ruleteo: el monto se cambia desde el pago de la tarjeta.",
};

export function amountLock(transaction: {
  loanPrepayment: unknown | null;
  rouletteOperation: unknown | null;
}): AmountLock | null {
  if (transaction.loanPrepayment) return "PREPAYMENT";
  if (transaction.rouletteOperation) return "ROULETTE";
  return null;
}

// Para el formulario: el motivo y adónde ir a cambiar el monto.
export function amountLockInfo(transaction: {
  loanPrepayment: { scheduledPaymentId: string } | null;
  rouletteOperation: { scheduledPaymentId: string; dueDate: Date } | null;
}): { kind: AmountLock; href: string } | null {
  const { loanPrepayment, rouletteOperation } = transaction;
  if (loanPrepayment) return { kind: "PREPAYMENT", href: `/dashboard/prestamos/${loanPrepayment.scheduledPaymentId}` };
  if (rouletteOperation) {
    return {
      kind: "ROULETTE",
      href: `/dashboard/calendario/pago/${rouletteOperation.scheduledPaymentId}/${toUTCDateInputValue(rouletteOperation.dueDate)}`,
    };
  }
  return null;
}
