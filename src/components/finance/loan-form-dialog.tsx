"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoanInfoFields, type LoanInfoValues } from "@/components/finance/loan-info-fields";
import { createLoan, regenerateLoanSchedule } from "@/features/loans/actions";
import { parseDateOnly } from "@/lib/date";
import { formatCurrency, formatDate } from "@/lib/format";
import { LOAN_DATE_SHIFT_LABELS } from "@/lib/labels";
import {
  generateLoanSchedule,
  LOAN_DATE_SHIFTS,
  overpaidInstallment,
  summarizeLoan,
  type LoanDateShift,
} from "@/lib/loan";

type Option = { id: string; name: string };

const DAY_MS = 24 * 60 * 60 * 1000;

export type LoanParamValues = {
  principal: string;
  teaPercent: string;
  installments: string;
  // "YYYY-MM-DD"
  disbursementDate: string;
  firstDueDate: string;
  fixedInstallment: string;
  lifeInsurancePercent: string;
  otherCharges: string;
  dateShift: LoanDateShift;
  dayBasis: "360" | "365";
};

const EMPTY_PARAMS: LoanParamValues = {
  principal: "",
  teaPercent: "",
  installments: "",
  disbursementDate: "",
  firstDueDate: "",
  fixedInstallment: "",
  lifeInsurancePercent: "",
  otherCharges: "",
  dateShift: "SUNDAY",
  dayBasis: "360",
};

// Crea un préstamo o, con `scheduledPaymentId`, vuelve a generar su cronograma.
export function LoanFormDialog({
  accounts,
  categories,
  scheduledPaymentId,
  initialParams,
  disabledReason,
}: {
  accounts: Option[];
  categories: Option[];
  scheduledPaymentId?: string;
  initialParams?: LoanParamValues;
  // Si no se puede regenerar (ya hay cuotas pagadas), por qué.
  disabledReason?: string;
}) {
  const isRegenerate = Boolean(scheduledPaymentId);
  const [open, setOpen] = useState(false);
  const [params, setParams] = useState<LoanParamValues>(initialParams ?? EMPTY_PARAMS);
  const [info, setInfo] = useState<LoanInfoValues>({
    name: "",
    lender: "",
    categoryId: "",
    accountId: null,
    paymentMethod: null,
  });
  const [state, formAction, pending] = useActionState(
    scheduledPaymentId ? regenerateLoanSchedule.bind(null, scheduledPaymentId) : createLoan,
    null
  );
  const wasPending = useRef(false);

  useEffect(() => {
    // Crear redirige a la página del préstamo; regenerar se queda y cierra.
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && initialParams) setParams(initialParams);
  }

  function set<K extends keyof LoanParamValues>(field: K, value: LoanParamValues[K]) {
    setParams((current) => ({ ...current, [field]: value }));
  }

  const preview = useMemo(() => {
    const principal = Number(params.principal);
    const tea = Number(params.teaPercent) / 100;
    const installments = Number(params.installments);
    const disbursementDate = parseDateOnly(params.disbursementDate);
    const firstDueDate = parseDateOnly(params.firstDueDate);
    const fixed = params.fixedInstallment ? Number(params.fixedInstallment) : null;
    if (
      !(principal > 0) ||
      !(tea >= 0) ||
      !Number.isInteger(installments) ||
      installments < 1 ||
      installments > 480 ||
      !disbursementDate ||
      !firstDueDate ||
      firstDueDate <= disbursementDate ||
      (fixed !== null && !(fixed > 0))
    ) {
      return null;
    }
    const rows = generateLoanSchedule({
      principal,
      tea,
      installments,
      disbursementDate,
      firstDueDate,
      dayBasis: Number(params.dayBasis),
      lifeInsuranceRate: (Number(params.lifeInsurancePercent) || 0) / 100,
      otherCharges: Number(params.otherCharges) || 0,
      fixedInstallment: fixed,
      dateShift: params.dateShift,
    });
    const last = rows.at(-1)!;
    return {
      installment: (rows[1] ?? rows[0]).total,
      first: rows[0],
      graceDays: Math.round((rows[0].dueDate.getTime() - disbursementDate.getTime()) / DAY_MS),
      last,
      totals: summarizeLoan(rows),
      overpaidAt: overpaidInstallment(rows),
    };
  }, [params]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isRegenerate ? (
          <Button variant="outline" disabled={Boolean(disabledReason)} title={disabledReason}>
            <RefreshCw />
            Regenerar cronograma
          </Button>
        ) : (
          <Button>
            <Plus />
            Nuevo préstamo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isRegenerate ? "Regenerar cronograma" : "Nuevo préstamo"}</DialogTitle>
          <DialogDescription>
            {isRegenerate
              ? "Reemplaza todas las cuotas con las de estos datos."
              : "Con los datos del préstamo se arma el cronograma de cuotas (cuota fija). Después podés ajustar cada cuota para que coincida con el del banco."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {!isRegenerate && <LoanInfoFields values={info} onChange={setInfo} accounts={accounts} categories={categories} />}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumberField label="Monto (S/)" name="principal" value={params.principal} onChange={(v) => set("principal", v)} required />
            <NumberField label="TEA (%)" name="teaPercent" value={params.teaPercent} onChange={(v) => set("teaPercent", v)} step="0.0001" required />
            <NumberField label="N.º de cuotas" name="installments" value={params.installments} onChange={(v) => set("installments", v)} step="1" min="1" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="loan-disbursement">Desembolso</Label>
              <Input
                id="loan-disbursement"
                name="disbursementDate"
                type="date"
                value={params.disbursementDate}
                onChange={(e) => set("disbursementDate", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="loan-first-due">Primera cuota</Label>
              <Input
                id="loan-first-due"
                name="firstDueDate"
                type="date"
                value={params.firstDueDate}
                onChange={(e) => set("firstDueDate", e.target.value)}
                required
              />
            </div>
          </div>

          <NumberField
            label="Cuota fija (opcional)"
            name="fixedInstallment"
            value={params.fixedInstallment}
            onChange={(v) => set("fixedInstallment", v)}
            hint="Si tu cronograma ya trae la cuota, escribila: así cada cuota coincide al céntimo y solo la última ajusta."
          />

          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Desgravamen (% mensual)"
              name="lifeInsurancePercent"
              value={params.lifeInsurancePercent}
              onChange={(v) => set("lifeInsurancePercent", v)}
              step="0.0001"
              hint="Sobre el saldo. Ej. 0.0285"
            />
            <NumberField
              label="Otros cargos (S/ por mes)"
              name="otherCharges"
              value={params.otherCharges}
              onChange={(v) => set("otherCharges", v)}
              hint="Seguro del bien, portes."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="loan-date-shift">Día no hábil</Label>
              <Select value={params.dateShift} onValueChange={(v) => set("dateShift", v as LoanDateShift)}>
                <SelectTrigger id="loan-date-shift" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOAN_DATE_SHIFTS.map((shift) => (
                    <SelectItem key={shift} value={shift}>
                      {LOAN_DATE_SHIFT_LABELS[shift]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="dateShift" value={params.dateShift} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="loan-day-basis">Año de</Label>
              <Select value={params.dayBasis} onValueChange={(v) => set("dayBasis", v as "360" | "365")}>
                <SelectTrigger id="loan-day-basis" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="360">360 días (bancos)</SelectItem>
                  <SelectItem value="365">365 días</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" name="dayBasis" value={params.dayBasis} />
            </div>
          </div>

          {preview && (
            <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <PreviewStat label="Cuota" value={formatCurrency(preview.installment)} />
                <PreviewStat label="Total a pagar" value={formatCurrency(preview.totals.total)} />
                <PreviewStat label="Intereses" value={formatCurrency(preview.totals.interest)} expense />
                <PreviewStat label="Seguros y cargos" value={formatCurrency(preview.totals.insurance)} />
              </div>
              {preview.overpaidAt && (
                <p className="text-sm text-destructive">
                  En la cuota {preview.overpaidAt} el saldo queda negativo: la deuda se termina antes de lo previsto.
                  Revisá la fecha de desembolso, la TEA o la cuota fija.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Primera cuota el {formatDate(preview.first.dueDate)} ({preview.graceDays} días desde el desembolso)
                {preview.first.principal < 0 && ": no alcanza a cubrir los intereses, el saldo sube"} · última el{" "}
                {formatDate(preview.last.dueDate)} por {formatCurrency(preview.last.total)}.
              </p>
            </div>
          )}

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending || !preview || Boolean(preview.overpaidAt)}>
              {pending ? "Guardando…" : isRegenerate ? "Regenerar" : "Crear préstamo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  label,
  name,
  value,
  onChange,
  hint,
  step = "0.01",
  min = "0",
  required = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  step?: string;
  min?: string;
  required?: boolean;
}) {
  const id = `loan-${name}`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="number"
        step={step}
        min={min}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PreviewStat({ label, value, expense = false }: { label: string; value: string; expense?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${expense ? "text-expense" : ""}`}>{value}</span>
    </div>
  );
}
