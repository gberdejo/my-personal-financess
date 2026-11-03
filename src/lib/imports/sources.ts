import type { PaymentMethod } from "@/generated/prisma/client";
import { normalizeHeader } from "@/lib/imports/text";
import { parseGeneric } from "@/lib/imports/generic";
import type { ParsedImport, ParsedMovement } from "@/lib/imports/types";
import { parseYape } from "@/lib/imports/yape";

// Formatos de archivo que se pueden importar. Para sumar uno (ej. la cuenta de
// ahorros del BCP) se agrega su lector y una entrada aquí.
export type ImportSource = "GENERIC" | "YAPE";

type SourceDefinition = {
  label: string;
  // Extensiones que acepta el selector de archivo.
  accept: string;
  // Dónde se descarga el archivo.
  help: string;
  // Plantilla para descargar y llenar (en public/).
  template?: string;
  // Método de pago de los gastos que se aplican. `null`: se elige al importar
  // (y cada fila puede traer el suyo).
  paymentMethod: PaymentMethod | null;
  parse: (rows: string[][]) => ParsedImport;
  // Descripción de la transacción.
  describe: (movement: Pick<ParsedMovement, "kind" | "counterparty" | "message">) => string | null;
};

// El orden es el del selector de origen.
export const IMPORT_SOURCES: Record<ImportSource, SourceDefinition> = {
  GENERIC: {
    label: "Plantilla genérica",
    accept: ".csv,.xlsx,.xls",
    help: "Descargá la plantilla, copiá tus movimientos (fecha, tipo y monto; lo demás es opcional, incluso links de comprobantes en Drive) y subila en CSV o Excel.",
    template: "/plantillas/movimientos.csv",
    paymentMethod: null,
    parse: parseGeneric,
    describe: ({ counterparty, message }) => [counterparty, message].filter(Boolean).join(" · ") || null,
  },
  YAPE: {
    label: "Yape",
    accept: ".xlsx,.xls,.csv",
    help: "En la app de Yape: Movimientos → Descargar reporte (Excel).",
    paymentMethod: "YAPE",
    parse: parseYape,
    // "a Andre Pér* · Almuerzo" (el método de pago ya dice que fue Yape).
    describe: ({ kind, counterparty, message }) =>
      [counterparty ? `${kind === "EXPENSE" ? "a" : "de"} ${counterparty}` : null, message]
        .filter(Boolean)
        .join(" · ") || null,
  },
};

export const IMPORT_SOURCE_LIST = Object.keys(IMPORT_SOURCES) as ImportSource[];

export function isImportSource(value: string): value is ImportSource {
  return Object.hasOwn(IMPORT_SOURCES, value);
}

// Contraparte comparable entre importaciones ("Fabiola Lop*" = "FABIOLA LOP*").
export function counterpartyKey(counterparty: string | null) {
  return counterparty ? normalizeHeader(counterparty) : "";
}

// Identifica el mismo movimiento si se vuelve a importar. En la plantilla la
// hora es opcional: se suma la descripción para no confundir dos gastos
// iguales del mismo día.
export function movementFingerprint(source: ImportSource, movement: ParsedMovement) {
  return [
    source,
    movement.occurredAt.toISOString(),
    movement.kind,
    movement.amount.toFixed(2),
    counterpartyKey(movement.counterparty),
    ...(source === "GENERIC" ? [counterpartyKey(movement.message)] : []),
  ].join("|");
}
