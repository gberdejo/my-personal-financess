"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ClipboardPaste, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OccurrenceStatusMark } from "@/components/finance/occurrence-row";
import { saveBillingSchedule } from "@/features/schedule/actions";
import type { OccurrenceStatusView } from "@/features/schedule/queries";
import { nextBusinessDay, parseBillingSchedule, previousBusinessDay } from "@/lib/billing-schedule";
import { parseDateOnly, shiftDay, toUTCDateInputValue } from "@/lib/date";
import { formatCurrency, formatDayMonth, formatWeekdayDayMonth } from "@/lib/format";
import { MONTH_NAMES } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type BillingScheduleFormRow = {
  month: number;
  // "YYYY-MM-DD"
  closing: string;
  due: string;
  fromSchedule: boolean;
  // Estado del vencimiento en el calendario, si existe.
  entry: {
    status: OccurrenceStatusView;
    amount: number;
    hasStatement: boolean;
    rouletteCount: number;
    href: string;
  } | null;
};

type RowValues = { closing: string; due: string; edited: boolean };

const STATUS_TEXT: Record<OccurrenceStatusView, string> = {
  PENDING: "Pendiente",
  OVERDUE: "Vencida",
  PAID: "Pagada",
  SKIPPED: "Omitida",
};

function formatInput(value: string, format: (date: Date) => string) {
  const date = parseDateOnly(value);
  return date ? format(date) : "—";
}

export function CardBillingScheduleForm({
  scheduledPaymentId,
  year,
  previousClosing,
  rows,
}: {
  scheduledPaymentId: string;
  year: number;
  // Cierre de diciembre del año anterior, para los consumos de enero ("YYYY-MM-DD").
  previousClosing: string;
  rows: BillingScheduleFormRow[];
}) {
  const initialValues = useMemo(
    () => rows.map((row) => ({ closing: row.closing, due: row.due, edited: false })),
    [rows]
  );
  const [values, setValues] = useState<RowValues[]>(initialValues);
  const [state, formAction, pending] = useActionState(saveBillingSchedule.bind(null, scheduledPaymentId, year), null);
  const [saved, setSaved] = useState(false);
  const wasPending = useRef(false);

  // Tras guardar, el servidor manda las filas nuevas: se toman como punto de partida.
  useEffect(() => setValues(initialValues), [initialValues]);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setSaved(true);
    wasPending.current = pending;
  }, [pending, state]);

  function update(month: number, field: "closing" | "due", value: string) {
    setSaved(false);
    setValues((current) => current.map((row, m) => (m === month ? { ...row, [field]: value, edited: true } : row)));
  }

  // Solo toca los meses que todavía salen de la regla.
  function moveWeekends() {
    setSaved(false);
    setValues((current) =>
      current.map((row, m) => {
        if (rows[m].fromSchedule || row.edited) return row;
        const closing = parseDateOnly(row.closing);
        const due = parseDateOnly(row.due);
        if (!closing || !due) return row;
        const closingValue = toUTCDateInputValue(previousBusinessDay(closing));
        const dueValue = toUTCDateInputValue(nextBusinessDay(due));
        if (closingValue === row.closing && dueValue === row.due) return row;
        return { closing: closingValue, due: dueValue, edited: true };
      })
    );
  }

  function applyPasted(parsed: { month: number; closingDate: Date; dueDate: Date }[]) {
    setSaved(false);
    setValues((current) =>
      current.map((row, m) => {
        const match = parsed.find((p) => p.month === m);
        return match
          ? { closing: toUTCDateInputValue(match.closingDate), due: toUTCDateInputValue(match.dueDate), edited: true }
          : row;
      })
    );
  }

  const pendingRuleMonths = rows.filter((row, m) => !row.fromSchedule && !values[m]?.edited).length;
  const editedCount = values.filter((row) => row.edited).length;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {pendingRuleMonths === 0
            ? "Todos los meses tienen las fechas del banco."
            : `${pendingRuleMonths === 1 ? "1 mes sale" : `${pendingRuleMonths} meses salen`} de la regla: revisalos con el cronograma del banco.`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {pendingRuleMonths > 0 && (
            <Button type="button" variant="outline" onClick={moveWeekends}>
              Mover fines de semana a días hábiles
            </Button>
          )}
          <PasteScheduleDialog year={year} onApply={applyPasted} />
        </div>
      </div>

      <Card className="gap-0 py-0">
        <div className="hidden grid-cols-[7rem_9rem_1fr_1fr_9rem] gap-3 border-b px-4 py-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase md:grid">
          <span>Mes</span>
          <span>Consumos</span>
          <span>Cierre</span>
          <span>Fecha de pago</span>
          <span className="text-right">Estado</span>
        </div>
        <ul>
          {rows.map((row, m) => {
            const value = values[m] ?? { closing: row.closing, due: row.due, edited: false };
            const previous = m === 0 ? previousClosing : values[m - 1]?.closing;
            const previousDate = previous ? parseDateOnly(previous) : null;
            const fromRule = !row.fromSchedule && !value.edited;
            return (
              <li
                key={row.month}
                className="grid grid-cols-2 items-center gap-x-3 gap-y-2 border-t px-4 py-3 first:border-t-0 md:grid-cols-[7rem_9rem_1fr_1fr_9rem]"
              >
                <div className="col-span-2 flex items-center gap-2 md:col-span-1 md:flex-col md:items-start md:gap-0.5">
                  <span className="text-sm font-medium">{MONTH_NAMES[row.month]}</span>
                  {fromRule ? (
                    <span className="text-[10px] tracking-wide text-muted-foreground uppercase">Según la regla</span>
                  ) : value.edited ? (
                    <span className="text-[10px] tracking-wide text-primary uppercase">Sin guardar</span>
                  ) : null}
                </div>

                <span className="col-span-2 text-xs text-muted-foreground tabular-nums md:col-span-1">
                  {previousDate ? formatDayMonth(shiftDay(previousDate, 1)) : "—"} al{" "}
                  {formatInput(value.closing, formatDayMonth)}
                </span>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground md:sr-only">Cierre</span>
                  <Input
                    type="date"
                    name={`closing-${row.month}`}
                    value={value.closing}
                    onChange={(e) => update(row.month, "closing", e.target.value)}
                    className={cn(fromRule && "text-muted-foreground")}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground md:sr-only">Fecha de pago</span>
                  <Input
                    type="date"
                    name={`due-${row.month}`}
                    value={value.due}
                    onChange={(e) => update(row.month, "due", e.target.value)}
                    className={cn(fromRule && "text-muted-foreground")}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {formatInput(value.due, formatWeekdayDayMonth)}
                  </span>
                </label>

                <div className="col-span-2 flex items-center justify-end gap-2 text-xs md:col-span-1">
                  {row.entry ? (
                    <Link
                      href={row.entry.href}
                      className="flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted"
                    >
                      {row.entry.rouletteCount > 0 && <Repeat className="size-3 text-muted-foreground" />}
                      <span className="flex flex-col items-end">
                        <span className="font-medium">{STATUS_TEXT[row.entry.status]}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatCurrency(row.entry.amount)}
                          {!row.entry.hasStatement && row.entry.status !== "PAID" && " · est."}
                        </span>
                      </span>
                      <OccurrenceStatusMark status={row.entry.status} className="size-4" />
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Guardando…"
            : saved && editedCount === 0
              ? "Guardado"
              : `Guardar cronograma ${year}`}
        </Button>
      </div>
    </form>
  );
}

function PasteScheduleDialog({
  year,
  onApply,
}: {
  year: number;
  onApply: (rows: { month: number; closingDate: Date; dueDate: Date }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseBillingSchedule(text, year) : null), [text, year]);
  const otherYear = parsed && parsed.year !== year;

  function apply() {
    if (!parsed || otherYear) return;
    onApply(parsed.rows);
    setOpen(false);
    setText("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <ClipboardPaste />
          Pegar cronograma
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pegar cronograma del banco</DialogTitle>
          <DialogDescription>
            Copiá la tabla de la web o del PDF del banco (mes, consumos y fecha de pago) y pegala acá. Se completan las
            fechas en la tabla; después revisás y guardás.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"Octubre   26 Set. al 23 Oct.   lunes, 23 de Nov.\nNoviembre   24 Oct. al 25 Nov.   martes, 22 de Dic."}
          className="font-mono text-xs"
        />

        {parsed &&
          (otherYear ? (
            <p className="text-sm text-destructive">
              El cronograma es de {parsed.year}. Cambiá al año {parsed.year} para cargarlo.
            </p>
          ) : parsed.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No se reconoció ninguna fila. Cada fila tiene que empezar con el mes (“Octubre”) y tener la fecha de cierre
              y la de pago.
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-lg bg-muted/60 p-3 text-xs">
              <p className="mb-2 font-medium">
                {parsed.rows.length === 1 ? "1 mes reconocido" : `${parsed.rows.length} meses reconocidos`}
              </p>
              <ul className="flex flex-col gap-1 tabular-nums">
                {parsed.rows.map((row) => (
                  <li key={row.month} className="flex justify-between gap-4">
                    <span>{MONTH_NAMES[row.month]}</span>
                    <span className="text-muted-foreground">
                      cierra {formatDayMonth(row.closingDate)} · paga {formatWeekdayDayMonth(row.dueDate)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        <DialogFooter>
          <Button type="button" onClick={apply} disabled={!parsed || !!otherYear || parsed.rows.length === 0}>
            Usar estas fechas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
