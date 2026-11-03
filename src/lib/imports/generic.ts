import type { PaymentMethod, TransactionKind } from "@/generated/prisma/client";
import { normalizeHeader, parseLimaDateTime, parsePlainAmount } from "@/lib/imports/text";
import type { ImportIssue, ParsedImport, ParsedMovement } from "@/lib/imports/types";
import { parseReceiptUrls, receiptUrlsError } from "@/lib/receipts";

// Plantilla genérica de movimientos (public/plantillas/movimientos.csv), para
// cargar lo de cualquier banco o app copiándolo en ella. Encabezado:
// fecha | hora | tipo | monto | contraparte | descripcion | categoria | motivo | metodo_pago | comprobantes
// Obligatorios: fecha y monto. Sin "tipo", un monto negativo es gasto.

type Column =
  | "date"
  | "time"
  | "type"
  | "amount"
  | "counterparty"
  | "description"
  | "category"
  | "reason"
  | "paymentMethod"
  | "receipts";

const HEADERS: Record<Column, string[]> = {
  date: ["fecha", "fecha de operacion", "fecha operacion"],
  time: ["hora"],
  type: ["tipo", "tipo de movimiento"],
  amount: ["monto", "importe"],
  counterparty: ["contraparte", "persona", "comercio", "destino", "origen"],
  description: ["descripcion", "detalle", "mensaje", "glosa", "concepto"],
  category: ["categoria"],
  reason: ["motivo"],
  paymentMethod: ["metodo pago", "metodo de pago", "metodo"],
  receipts: ["comprobantes", "comprobante", "links", "link"],
};

const TYPES: Record<string, TransactionKind> = {
  gasto: "EXPENSE",
  egreso: "EXPENSE",
  cargo: "EXPENSE",
  salida: "EXPENSE",
  ingreso: "INCOME",
  abono: "INCOME",
  entrada: "INCOME",
};

const PAYMENT_METHODS: Record<string, PaymentMethod> = {
  yape: "YAPE",
  plin: "PLIN",
  efectivo: "CASH",
  "tarjeta de credito": "CREDIT_CARD",
  credito: "CREDIT_CARD",
  "tarjeta de debito": "DEBIT_CARD",
  debito: "DEBIT_CARD",
  transferencia: "TRANSFER",
};

const MAX_ROWS = 2000;

function columnsOf(cells: string[]) {
  const columns = new Map<Column, number>();
  cells.forEach((cell, i) => {
    const normalized = normalizeHeader(cell);
    for (const [column, aliases] of Object.entries(HEADERS) as [Column, string[]][]) {
      if (!columns.has(column) && aliases.includes(normalized)) columns.set(column, i);
    }
  });
  return columns;
}

// "8:30 p. m." o "8:30 PM" (como Excel muestra las horas en algunos equipos) → "20:30".
function to24Hours(raw: string) {
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i);
  if (!match) return raw;
  const [, hourText, minute, second, period] = match;
  const hour = (Number(hourText) % 12) + (period.toLowerCase() === "p" ? 12 : 0);
  return `${hour}:${minute}${second ? `:${second}` : ""}`;
}

export function parseGeneric(rows: string[][]): ParsedImport {
  const errors: ImportIssue[] = [];
  const warnings: string[] = [];

  const headerIndex = rows.findIndex((cells) => {
    const columns = columnsOf(cells);
    return columns.has("date") && columns.has("amount");
  });
  if (headerIndex < 0) {
    return {
      movements: [],
      errors: [{ row: null, message: 'No se encontró el encabezado de la plantilla (faltan las columnas "fecha" y "monto").' }],
      warnings,
    };
  }
  const columns = columnsOf(rows[headerIndex]);
  const cell = (cells: string[], column: Column) => {
    const index = columns.get(column);
    return index === undefined ? "" : String(cells[index] ?? "").trim();
  };

  const movements: ParsedMovement[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const cells = rows[i];
    const row = i + 1;
    // Filas vacías.
    if (cells.every((value) => !String(value ?? "").trim())) continue;

    const rawDate = cell(cells, "date");
    const rawTime = to24Hours(cell(cells, "time"));
    const when = parseLimaDateTime(rawTime ? `${rawDate} ${rawTime}` : rawDate);
    if (!when) {
      errors.push({
        row,
        message: `La fecha "${[rawDate, rawTime].filter(Boolean).join(" ")}" no es válida (DD/MM/AAAA y hora HH:MM).`,
      });
      continue;
    }

    const signed = parsePlainAmount(cell(cells, "amount"));
    if (signed === null || signed === 0) {
      errors.push({ row, message: `El monto "${cell(cells, "amount")}" no es válido.` });
      continue;
    }
    const rawType = cell(cells, "type");
    const kind = rawType ? TYPES[normalizeHeader(rawType)] : signed < 0 ? "EXPENSE" : "INCOME";
    if (!kind) {
      errors.push({ row, message: `El tipo "${rawType}" no es válido (gasto o ingreso).` });
      continue;
    }

    const rawMethod = cell(cells, "paymentMethod");
    const paymentMethod = rawMethod ? PAYMENT_METHODS[normalizeHeader(rawMethod)] : null;
    if (rawMethod && !paymentMethod) {
      errors.push({
        row,
        message: `El método de pago "${rawMethod}" no es válido (efectivo, yape, plin, tarjeta de débito, tarjeta de crédito o transferencia).`,
      });
      continue;
    }

    const receipts = parseReceiptUrls(cell(cells, "receipts"));
    const receiptsError = receiptUrlsError(receipts);
    if (receiptsError) {
      errors.push({ row, message: receiptsError });
      continue;
    }

    movements.push({
      row,
      occurredAt: when.occurredAt,
      date: when.date,
      kind,
      amount: Math.abs(signed),
      counterparty: cell(cells, "counterparty") || null,
      message: cell(cells, "description") || null,
      rawType: rawType || (kind === "EXPENSE" ? "gasto" : "ingreso"),
      categoryName: cell(cells, "category") || null,
      reason: cell(cells, "reason") || null,
      paymentMethod: kind === "EXPENSE" ? paymentMethod : null,
      receiptUrls: receipts.urls,
    });
  }

  if (!columns.has("type")) warnings.push('Sin columna "tipo": los montos negativos se toman como gastos.');
  if (movements.length === 0 && errors.length === 0) {
    errors.push({ row: null, message: "La plantilla no tiene movimientos." });
  }
  if (movements.length > MAX_ROWS) {
    errors.push({ row: null, message: `Son ${movements.length} movimientos; el máximo por archivo es ${MAX_ROWS}.` });
  }
  return { movements, errors, warnings };
}
