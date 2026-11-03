import type { PaymentMethod, TransactionKind } from "@/generated/prisma/client";

// Un movimiento leído de un archivo, antes de guardarse.
export type ParsedMovement = {
  // Fila del archivo (1 = la primera), para los errores y para ubicarlo.
  row: number;
  occurredAt: Date;
  // Día calendario como medianoche UTC.
  date: Date;
  kind: TransactionKind;
  amount: number;
  counterparty: string | null;
  message: string | null;
  rawType: string;
  // Solo la plantilla genérica: propuestas para aplicar el movimiento.
  categoryName?: string | null;
  reason?: string | null;
  paymentMethod?: PaymentMethod | null;
};

export type ImportIssue = { row: number | null; message: string };

export type ParsedImport = {
  movements: ParsedMovement[];
  errors: ImportIssue[];
  warnings: string[];
};
