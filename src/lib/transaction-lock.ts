// Gastos cuyo monto no se edita desde Transacciones: el de un prepago rehace
// el cronograma del préstamo. Se cambia desde su pantalla.
export type AmountLock = "PREPAYMENT";

export const AMOUNT_LOCK_LABELS: Record<AmountLock, string> = {
  PREPAYMENT: "Es el gasto de un prepago: el monto se cambia desde el préstamo.",
};

export function amountLock(transaction: { loanPrepayment: unknown | null }): AmountLock | null {
  return transaction.loanPrepayment ? "PREPAYMENT" : null;
}

// Para el formulario: el motivo y adónde ir a cambiar el monto.
export function amountLockInfo(transaction: {
  loanPrepayment: { scheduledPaymentId: string } | null;
}): { kind: AmountLock; href: string } | null {
  const { loanPrepayment } = transaction;
  if (loanPrepayment) return { kind: "PREPAYMENT", href: `/dashboard/prestamos/${loanPrepayment.scheduledPaymentId}` };
  return null;
}
