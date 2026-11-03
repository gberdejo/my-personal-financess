import { parseDateOnly } from "@/lib/date";
import { normalizeHeader } from "@/lib/imports/text";
import { clampedDate } from "@/lib/schedule";

// Cronograma de un préstamo en CSV: la plantilla que descargan los usuarios y el
// cronograma de su banco copiado en ella. Sirve para cualquier banco: los
// encabezados aceptan los nombres habituales y los números, varios formatos.

export const MAX_IMPORTED_INSTALLMENTS = 480;

// Tolerancia para comparar montos (redondeos del banco).
const CENT = 0.011;

const DAY_MS = 24 * 60 * 60 * 1000;

type Field = "number" | "date" | "principal" | "interest" | "lifeInsurance" | "otherCharges" | "total" | "balance";

// Encabezados normalizados (sin tildes, minúsculas, solo letras y números).
const HEADER_ALIASES: Record<Field, string[]> = {
  number: ["cuota", "nro", "n", "no", "numero", "nro cuota", "n cuota", "numero de cuota", "nro de cuota"],
  date: ["fecha", "fecha de pago", "fecha pago", "vencimiento", "fecha de vencimiento", "fecha vencimiento"],
  principal: ["capital", "amortizacion", "amortizacion de capital", "amort", "capital amortizado"],
  interest: ["interes", "intereses", "interes compensatorio"],
  lifeInsurance: ["desgravamen", "desgrav", "seguro desgravamen", "seguro de desgravamen", "seguro desgrav"],
  otherCharges: [
    "otros cargos",
    "otros",
    "seguro inmueble",
    "seguro de inmueble",
    "seguro del inmueble",
    "seguro del bien",
    "seguro bien",
    "inmueble",
    "seguro vehicular",
    "seguro",
    "portes",
    "comision",
    "comisiones",
    "gastos",
  ],
  total: [
    "cuota total",
    "cuota mensual",
    "total",
    "total cuota",
    "monto",
    "monto cuota",
    "importe",
    "cuota a pagar",
    "total a pagar",
  ],
  balance: ["saldo", "saldo capital", "saldo de capital", "saldo final", "saldo deuda", "saldo pendiente"],
};

export const LOAN_CSV_HEADERS = [
  "cuota",
  "fecha",
  "capital",
  "interes",
  "desgravamen",
  "otros_cargos",
  "cuota_total",
  "saldo",
] as const;

export type ImportedInstallment = {
  // Línea del archivo (para los errores).
  line: number;
  number: number;
  dueDate: Date;
  principal: number;
  interest: number;
  lifeInsurance: number;
  otherCharges: number;
  total: number;
  // Saldo de capital después de pagar la cuota (null si el archivo no lo trae).
  balance: number | null;
};

export type CsvIssue = { line: number | null; message: string };

export type ParsedLoanCsv = {
  rows: ImportedInstallment[];
  errors: CsvIssue[];
  warnings: string[];
  hasBreakdown: boolean;
  hasBalance: boolean;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function fieldFor(header: string): Field | null {
  const normalized = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [Field, string[]][]) {
    if (aliases.includes(normalized)) return field;
  }
  return null;
}

// Una línea CSV con comillas ("a, b" es un solo campo y "" es una comilla).
function splitLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function detectDelimiter(header: string) {
  const candidates = [",", ";", "\t"];
  return candidates.reduce((best, candidate) =>
    header.split(candidate).length > header.split(best).length ? candidate : best
  );
}

// "2,200.50", "2200,50" (coma decimal), "254.68-" o "(254.68)" (negativos de
// banco), "S/ 1,000". `null` = vacío; NaN = no es un número.
function parseAmount(raw: string, decimalComma: boolean) {
  let text = raw.replace(/\s/g, "").replace(/^(s\/|pen)/i, "");
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.endsWith("-")) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  }
  text = decimalComma ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(text)) return Number.NaN;
  return round2(Number(text) * (negative ? -1 : 1));
}

// "03/08/2026", "3-8-2026" o "2026-08-03".
function parseDate(raw: string) {
  const text = raw.trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const local = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : local ? [local[3], local[2], local[1]] : [];
  if (!year) return null;
  const date = parseDateOnly(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  // Algunos navegadores convierten el 31/02 en el 03/03: se rechaza.
  return date && date.getUTCDate() === Number(day) ? date : null;
}

// Cuántas filas encadenan el saldo si es "después de pagar" (saldo[i] =
// saldo[i-1] − capital[i]) y cuántas si es "antes de pagar" (saldo[i] =
// saldo[i-1] − capital[i-1], como muestran algunos bancos).
function balanceChains(rows: ImportedInstallment[]) {
  let after = 0;
  let before = 0;
  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1].balance!;
    const current = rows[i].balance!;
    if (Math.abs(previous - rows[i].principal - current) <= CENT) after++;
    if (Math.abs(previous - rows[i - 1].principal - current) <= CENT) before++;
  }
  return { after, before };
}

export function parseLoanCsv(text: string): ParsedLoanCsv {
  const errors: CsvIssue[] = [];
  const warnings: string[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() !== "");
  if (headerIndex < 0) {
    return { rows: [], errors: [{ line: null, message: "El archivo está vacío." }], warnings, hasBreakdown: false, hasBalance: false };
  }

  const delimiter = detectDelimiter(lines[headerIndex]);
  const headers = splitLine(lines[headerIndex], delimiter);
  const columns = headers.map(fieldFor);
  const ignored = headers.filter((header, i) => header && !columns[i]);
  if (ignored.length) warnings.push(`Columnas que no se usan: ${ignored.join(", ")}.`);

  const has = (field: Field) => columns.includes(field);
  for (const [field, label] of [
    ["date", "fecha"],
    ["total", "cuota_total"],
  ] as const) {
    if (!has(field)) errors.push({ line: headerIndex + 1, message: `Falta la columna "${label}".` });
  }
  if (errors.length) return { rows: [], errors, warnings, hasBreakdown: false, hasBalance: false };

  const hasBreakdown = (["principal", "interest", "lifeInsurance", "otherCharges"] as const).some(has);
  const hasBalance = has("balance");
  if (!has("number")) warnings.push('No hay columna "cuota": se numeran en orden.');

  const dataLines = lines
    .map((line, i) => ({ line: i + 1, cells: splitLine(line, delimiter) }))
    .slice(headerIndex + 1)
    .filter(({ cells }) => cells.some((cell) => cell !== ""));

  // Coma decimal si los montos terminan en ",dd" más que en ".dd" (Excel en español).
  const amountCells = dataLines.flatMap(({ cells }) =>
    cells.filter((_, i) => columns[i] && columns[i] !== "date" && columns[i] !== "number")
  );
  const commaDecimals = amountCells.filter((cell) => /\d,\d{1,2}-?$/.test(cell)).length;
  const dotDecimals = amountCells.filter((cell) => /\d\.\d{1,2}-?$/.test(cell)).length;
  const decimalComma = delimiter !== "," && commaDecimals > dotDecimals;

  const rows: ImportedInstallment[] = [];
  for (const { line, cells } of dataLines) {
    const value = (field: Field) => cells.filter((_, i) => columns[i] === field);
    const dateCell = value("date")[0] ?? "";
    // Filas de totales o notas al pie (sin fecha): se saltan.
    if (!dateCell) continue;

    const amount = (field: Field) => {
      const parsed = value(field).map((cell) => parseAmount(cell, decimalComma));
      if (parsed.some((n) => Number.isNaN(n))) return Number.NaN;
      const present = parsed.filter((n): n is number => n !== null);
      return present.length ? round2(present.reduce((sum, n) => sum + n, 0)) : null;
    };

    const dueDate = parseDate(dateCell);
    const numberCell = value("number")[0];
    const total = amount("total");
    // Sin columna "cuota": en orden, y una primera cuota en 0 es la 0.
    const number = numberCell
      ? Number(numberCell)
      : rows.length === 0 && total === 0
        ? 0
        : (rows.at(-1)?.number ?? 0) + 1;
    const parts = {
      principal: amount("principal"),
      interest: amount("interest"),
      lifeInsurance: amount("lifeInsurance"),
      otherCharges: amount("otherCharges"),
    };
    const balance = amount("balance");

    if (!dueDate) {
      errors.push({ line, message: `La fecha "${dateCell}" no es válida (usá DD/MM/AAAA).` });
      continue;
    }
    // La cuota 0 es el periodo de gracia capitalizado (algunos bancos lo muestran antes de la cuota 1).
    if (!Number.isInteger(number) || number < 0) {
      errors.push({ line, message: `El n.º de cuota "${numberCell}" no es válido.` });
      continue;
    }
    if (total === null || Number.isNaN(total) || (number === 0 ? total !== 0 : total <= 0)) {
      errors.push({
        line,
        message: number === 0 ? "La cuota 0 (periodo de gracia) tiene que tener cuota total 0." : "La cuota total tiene que ser un monto mayor a 0.",
      });
      continue;
    }
    if (Object.values(parts).some((n) => Number.isNaN(n)) || Number.isNaN(balance)) {
      errors.push({ line, message: "Hay un monto que no es un número." });
      continue;
    }
    if ([parts.interest, parts.lifeInsurance, parts.otherCharges].some((n) => n !== null && n < 0)) {
      errors.push({ line, message: "Interés, seguros y otros cargos no pueden ser negativos." });
      continue;
    }

    const row: ImportedInstallment = {
      line,
      number,
      dueDate,
      principal: parts.principal ?? 0,
      interest: parts.interest ?? 0,
      lifeInsurance: parts.lifeInsurance ?? 0,
      otherCharges: parts.otherCharges ?? 0,
      total,
      balance,
    };
    // Solo se valida el desglose si la fila lo trae (puede dejarse vacío).
    if (hasBreakdown && Object.values(parts).some((n) => n !== null)) {
      const sum = round2(row.principal + row.interest + row.lifeInsurance + row.otherCharges);
      if (Math.abs(sum - total) > CENT) {
        errors.push({
          line,
          message: `Capital + interés + seguros + otros suman ${sum.toFixed(2)}, pero la cuota es ${total.toFixed(2)}.`,
        });
        continue;
      }
    }
    rows.push(row);
  }

  if (rows.length === 0 && errors.length === 0) errors.push({ line: null, message: "No hay cuotas en el archivo." });
  if (rows.length > 0 && !rows.some((row) => row.total > 0)) {
    errors.push({ line: null, message: "No hay ninguna cuota con monto a pagar." });
  }
  if (rows.length > MAX_IMPORTED_INSTALLMENTS) {
    errors.push({ line: null, message: `Son ${rows.length} cuotas; el máximo es ${MAX_IMPORTED_INSTALLMENTS}.` });
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].dueDate <= rows[i - 1].dueDate) {
      errors.push({ line: rows[i].line, message: "Las fechas tienen que ir de la más antigua a la más reciente, sin repetirse." });
    }
    if (rows[i].number <= rows[i - 1].number) {
      errors.push({ line: rows[i].line, message: "Los números de cuota tienen que ir en orden, sin repetirse." });
    }
  }

  if (hasBalance && has("principal") && rows.length > 1 && rows.every((r) => r.balance !== null)) {
    const { after, before } = balanceChains(rows);
    // Con capital constante las dos lecturas encadenan igual: decide la última
    // cuota (después de pagarla el saldo es 0; antes, su propio capital).
    const last = rows.at(-1)!;
    const endsBefore =
      Math.abs(last.balance!) > CENT && Math.abs(last.balance! - last.principal) <= CENT;
    if (before > after || (before === after && endsBefore)) {
      // Se pasa a "saldo después de pagar", que es lo que guarda la app.
      for (const row of rows) row.balance = round2(row.balance! - row.principal);
      warnings.push("El saldo del archivo es el de antes de pagar cada cuota (como en muchos bancos): se convirtió al saldo después de pagar.");
    }
    for (let i = 1; i < rows.length; i++) {
      const expected = round2(rows[i - 1].balance! - rows[i].principal);
      if (Math.abs(expected - rows[i].balance!) > CENT) {
        errors.push({
          line: rows[i].line,
          message: `El saldo no cuadra: con el capital de esta cuota debería ser ${expected.toFixed(2)} y dice ${rows[i].balance!.toFixed(2)}.`,
        });
      }
    }
  }

  return { rows, errors, warnings, hasBreakdown, hasBalance };
}

function mostFrequent(values: number[]) {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function summarizeImport(rows: ImportedInstallment[]) {
  const sum = (pick: (row: ImportedInstallment) => number) => round2(rows.reduce((acc, row) => acc + pick(row), 0));
  const first = rows[0];
  // Monto prestado: el saldo antes de la primera cuota, o lo que suma el capital.
  const principal = first?.balance != null ? round2(first.balance + first.principal) : sum((r) => r.principal);
  const payable = rows.filter((r) => r.total > 0);
  return {
    // Cuotas a pagar (sin la cuota 0 del periodo de gracia).
    count: payable.length,
    firstDate: first?.dueDate ?? null,
    lastDate: rows.at(-1)?.dueDate ?? null,
    installment: mostFrequent(payable.map((r) => r.total)),
    total: sum((r) => r.total),
    interest: sum((r) => r.interest),
    insurance: sum((r) => r.lifeInsurance + r.otherCharges),
    principal,
  };
}

// Un mes antes de la primera cuota: desembolso supuesto si no se indica.
export function defaultDisbursement(firstDueDate: Date) {
  return clampedDate(firstDueDate.getUTCFullYear(), firstDueDate.getUTCMonth() - 1, firstDueDate.getUTCDate());
}

// Tasas aproximadas a partir del cronograma (para recalcular si se agrega un
// prepago sin reimportar). Se ignora la primera cuota, que suele tener reglas
// propias del banco. `null` si no hay datos suficientes.
export function estimateRates(rows: ImportedInstallment[], dayBasis: number) {
  const teas: number[] = [];
  const lifeRates: number[] = [];
  const monthlyCharges: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const balance = rows[i - 1].balance ?? null;
    const days = Math.round((rows[i].dueDate.getTime() - rows[i - 1].dueDate.getTime()) / DAY_MS);
    if (days <= 0) continue;
    if (rows[i].otherCharges > 0) monthlyCharges.push(rows[i].otherCharges * (30 / days));
    if (balance === null || balance <= 0) continue;
    if (rows[i].interest > 0) teas.push((1 + rows[i].interest / balance) ** (dayBasis / days) - 1);
    if (rows[i].lifeInsurance > 0) lifeRates.push(rows[i].lifeInsurance / balance / (days / 30));
  }
  const tea = median(teas);
  const lifeInsuranceRate = median(lifeRates);
  const otherCharges = median(monthlyCharges);
  return {
    tea: tea !== null ? Math.round(tea * 1e6) / 1e6 : null,
    lifeInsuranceRate: lifeInsuranceRate !== null ? Math.round(lifeInsuranceRate * 1e6) / 1e6 : 0,
    otherCharges: otherCharges !== null ? round2(otherCharges) : 0,
  };
}

function formatCsvDate(date: Date) {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

// El cronograma en el formato de la plantilla (para descargarlo, corregirlo y
// volver a subirlo).
export function toLoanCsv(
  rows: {
    number: number;
    dueDate: Date;
    principal: number;
    interest: number;
    lifeInsurance: number;
    otherCharges: number;
    total: number;
    balance: number | null;
  }[]
) {
  const lines = rows.map((row) =>
    [
      row.number,
      formatCsvDate(row.dueDate),
      row.principal.toFixed(2),
      row.interest.toFixed(2),
      row.lifeInsurance.toFixed(2),
      row.otherCharges.toFixed(2),
      row.total.toFixed(2),
      row.balance !== null ? row.balance.toFixed(2) : "",
    ].join(",")
  );
  return [LOAN_CSV_HEADERS.join(","), ...lines].join("\r\n") + "\r\n";
}
