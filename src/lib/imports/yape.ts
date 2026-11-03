import type { TransactionKind } from "@/generated/prisma/client";
import { normalizeHeader, parseLimaDateTime, parsePlainAmount } from "@/lib/imports/text";
import type { ImportIssue, ParsedImport, ParsedMovement } from "@/lib/imports/types";

// Reporte de movimientos de Yape (app → Movimientos → Descargar). Arriba trae
// un título y filas vacías; el encabezado es:
// Tipo de Transacción | Origen | Destino | Monto | Mensaje | Fecha de operación

type Column = "type" | "origin" | "destination" | "amount" | "message" | "date";

const HEADERS: Record<Column, string[]> = {
  type: ["tipo de transaccion", "tipo"],
  origin: ["origen"],
  destination: ["destino"],
  amount: ["monto", "importe"],
  message: ["mensaje"],
  date: ["fecha de operacion", "fecha"],
};

// Tipos de Yape: quién es la contraparte depende de si pagaste o te pagaron.
const TYPES: Record<string, { kind: TransactionKind; counterparty: "origin" | "destination" }> = {
  pagaste: { kind: "EXPENSE", counterparty: "destination" },
  "te pago": { kind: "INCOME", counterparty: "origin" },
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

export function parseYape(rows: string[][]): ParsedImport {
  const errors: ImportIssue[] = [];
  const warnings: string[] = [];

  const headerIndex = rows.findIndex((cells) => {
    const columns = columnsOf(cells);
    return columns.has("type") && columns.has("amount") && columns.has("date");
  });
  if (headerIndex < 0) {
    return {
      movements: [],
      errors: [{ row: null, message: "No parece un reporte de Yape: no se encontró el encabezado de movimientos." }],
      warnings,
    };
  }
  const columns = columnsOf(rows[headerIndex]);
  const cell = (cells: string[], column: Column) => {
    const index = columns.get(column);
    return index === undefined ? "" : String(cells[index] ?? "").trim();
  };

  const movements: ParsedMovement[] = [];
  const unknownTypes = new Set<string>();
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const cells = rows[i];
    const row = i + 1;
    const rawType = cell(cells, "type");
    // Filas vacías o de cierre del reporte.
    if (!rawType && !cell(cells, "amount")) continue;

    const type = TYPES[normalizeHeader(rawType)];
    if (!type) {
      unknownTypes.add(rawType || "(vacío)");
      continue;
    }
    const amount = parsePlainAmount(cell(cells, "amount"));
    if (amount === null || amount <= 0) {
      errors.push({ row, message: `El monto "${cell(cells, "amount")}" no es válido.` });
      continue;
    }
    const when = parseLimaDateTime(cell(cells, "date"));
    if (!when) {
      errors.push({ row, message: `La fecha "${cell(cells, "date")}" no es válida (DD/MM/AAAA HH:MM:SS).` });
      continue;
    }
    movements.push({
      row,
      occurredAt: when.occurredAt,
      date: when.date,
      kind: type.kind,
      amount,
      counterparty: cell(cells, type.counterparty) || null,
      message: cell(cells, "message") || null,
      rawType,
    });
  }

  if (unknownTypes.size > 0) {
    warnings.push(`Se saltaron movimientos de tipo: ${[...unknownTypes].join(", ")}.`);
  }
  if (movements.length === 0 && errors.length === 0) {
    errors.push({ row: null, message: "El reporte no tiene movimientos." });
  }
  if (movements.length > MAX_ROWS) {
    errors.push({ row: null, message: `Son ${movements.length} movimientos; el máximo por archivo es ${MAX_ROWS}.` });
  }
  return { movements, errors, warnings };
}
