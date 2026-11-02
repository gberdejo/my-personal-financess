"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/format";
import { parseLoanCsv, summarizeImport, type ParsedLoanCsv } from "@/lib/loan-csv";

const PREVIEW_ROWS = 3;
const ERRORS_SHOWN = 8;

// Elegir el CSV del cronograma, ver qué se va a importar y avisar si algo no
// cuadra. Manda el texto en el campo `csv`; `onValidChange` dice si se puede guardar.
export function LoanCsvImport({ onValidChange }: { onValidChange: (valid: boolean) => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedLoanCsv | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const content = await file.text();
    const result = parseLoanCsv(content);
    setText(content);
    setFileName(file.name);
    setParsed(result);
    onValidChange(result.errors.length === 0 && result.rows.length > 0);
  }

  const summary = parsed && parsed.rows.length > 0 ? summarizeImport(parsed.rows) : null;
  const preview = parsed
    ? parsed.rows.length > PREVIEW_ROWS * 2
      ? [...parsed.rows.slice(0, PREVIEW_ROWS), null, ...parsed.rows.slice(-PREVIEW_ROWS)]
      : parsed.rows
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="loan-csv-file">Cronograma (CSV)</Label>
          <Input
            id="loan-csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
        <a
          href="/plantillas/cronograma-prestamo.csv"
          download
          className="flex items-center gap-1 pb-2 text-sm font-medium text-primary hover:underline"
        >
          <Download className="size-3.5" />
          Descargar plantilla
        </a>
      </div>
      <input type="hidden" name="csv" value={text} />

      {!parsed && (
        <p className="text-xs text-muted-foreground">
          Copiá el cronograma del banco en la plantilla: una fila por cuota con su fecha (DD/MM/AAAA) y la cuota total.
          Capital, interés, seguros y saldo son opcionales; si los ponés, se revisa que cuadren. En Excel, guardalo con
          “Guardar como → CSV”.
        </p>
      )}

      {parsed && parsed.errors.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">
            {fileName}: {parsed.errors.length === 1 ? "1 problema" : `${parsed.errors.length} problemas`}
          </p>
          <ul className="flex flex-col gap-0.5 text-xs">
            {parsed.errors.slice(0, ERRORS_SHOWN).map((error, i) => (
              <li key={i}>
                {error.line ? `Línea ${error.line}: ` : ""}
                {error.message}
              </li>
            ))}
            {parsed.errors.length > ERRORS_SHOWN && <li>… y {parsed.errors.length - ERRORS_SHOWN} más.</li>}
          </ul>
        </div>
      )}

      {parsed && parsed.warnings.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {parsed.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {summary && parsed && parsed.errors.length === 0 && (
        <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Cuotas" value={String(summary.count)} />
            <Stat label="Cuota" value={formatCurrency(summary.installment)} />
            <Stat label="Total a pagar" value={formatCurrency(summary.total)} />
            <Stat label={parsed.hasBreakdown ? "Intereses" : "Hasta"} value={parsed.hasBreakdown ? formatCurrency(summary.interest) : formatDate(summary.lastDate!)} />
          </div>
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left font-medium">N.º</th>
                <th className="text-left font-medium">Fecha</th>
                {parsed.hasBreakdown && <th className="text-right font-medium">Capital</th>}
                {parsed.hasBreakdown && <th className="text-right font-medium">Interés</th>}
                <th className="text-right font-medium">Cuota</th>
                {parsed.hasBalance && <th className="text-right font-medium">Saldo</th>}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) =>
                row ? (
                  <tr key={row.line}>
                    <td>{row.number}</td>
                    <td>{formatDate(row.dueDate)}</td>
                    {parsed.hasBreakdown && <td className="text-right">{formatCurrency(row.principal)}</td>}
                    {parsed.hasBreakdown && <td className="text-right">{formatCurrency(row.interest)}</td>}
                    <td className="text-right font-medium">{formatCurrency(row.total)}</td>
                    {parsed.hasBalance && (
                      <td className="text-right">{row.balance !== null ? formatCurrency(row.balance) : "—"}</td>
                    )}
                  </tr>
                ) : (
                  <tr key={`gap-${i}`}>
                    <td colSpan={6} className="text-center text-muted-foreground">
                      …
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            Del {formatDate(summary.firstDate!)} al {formatDate(summary.lastDate!)}. Las cuotas se guardan tal cual vienen
            en el archivo.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
