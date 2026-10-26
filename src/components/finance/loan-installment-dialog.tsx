"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
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
import { saveLoanInstallment } from "@/features/loans/actions";
import { formatCurrency } from "@/lib/format";

type InstallmentValues = {
  id: string;
  number: number;
  // "YYYY-MM-DD"
  dueDate: string;
  principal: number;
  interest: number;
  lifeInsurance: number;
  otherCharges: number;
};

type Fields = { dueDate: string; principal: string; interest: string; lifeInsurance: string; otherCharges: string };

function toFields(installment?: InstallmentValues, defaultDate = ""): Fields {
  return {
    dueDate: installment?.dueDate ?? defaultDate,
    principal: installment ? String(installment.principal) : "",
    interest: installment ? String(installment.interest) : "",
    lifeInsurance: installment ? String(installment.lifeInsurance) : "",
    otherCharges: installment ? String(installment.otherCharges) : "",
  };
}

// Edita una cuota del cronograma (o agrega una). La cuota es la suma de sus partes.
export function LoanInstallmentDialog({
  scheduledPaymentId,
  installment,
  defaultDate,
}: {
  scheduledPaymentId: string;
  installment?: InstallmentValues;
  // "YYYY-MM-DD" propuesto al agregar.
  defaultDate?: string;
}) {
  const isEdit = Boolean(installment);
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Fields>(toFields(installment, defaultDate));
  const [state, formAction, pending] = useActionState(
    saveLoanInstallment.bind(null, scheduledPaymentId, installment?.id ?? null),
    null
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setFields(toFields(installment, defaultDate));
  }

  function set(field: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  const total =
    (Number(fields.principal) || 0) +
    (Number(fields.interest) || 0) +
    (Number(fields.lifeInsurance) || 0) +
    (Number(fields.otherCharges) || 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
            <Pencil className="size-3.5" />
            <span className="sr-only">Editar cuota</span>
          </Button>
        ) : (
          <Button variant="outline">
            <Plus />
            Agregar cuota
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Cuota ${installment!.number}` : "Nueva cuota"}</DialogTitle>
          <DialogDescription>
            Copiá los montos del cronograma del banco. El saldo y la numeración se recalculan solos.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="installment-date">Fecha de pago</Label>
            <Input
              id="installment-date"
              name="dueDate"
              type="date"
              value={fields.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <AmountField
              label="Capital (S/)"
              name="principal"
              value={fields.principal}
              onChange={(v) => set("principal", v)}
              allowNegative
            />
            <AmountField label="Interés (S/)" name="interest" value={fields.interest} onChange={(v) => set("interest", v)} />
            <AmountField
              label="Desgravamen (S/)"
              name="lifeInsurance"
              value={fields.lifeInsurance}
              onChange={(v) => set("lifeInsurance", v)}
            />
            <AmountField
              label="Otros cargos (S/)"
              name="otherCharges"
              value={fields.otherCharges}
              onChange={(v) => set("otherCharges", v)}
            />
          </div>
          <p className="text-right text-sm text-muted-foreground">
            Cuota <span className="font-semibold text-foreground tabular-nums">{formatCurrency(total)}</span>
          </p>
          {isEdit && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="recalculateFollowing" className="mt-0.5 size-4 accent-primary" />
              <span>
                Recalcular las cuotas siguientes
                <span className="block text-xs text-muted-foreground">
                  Con la tasa y los seguros del préstamo, desde el saldo que deja esta cuota. Usalo si copiaste del
                  banco una cuota con un monto distinto (ej. la primera).
                </span>
              </span>
            </label>
          )}
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AmountField({
  label,
  name,
  value,
  onChange,
  allowNegative = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  allowNegative?: boolean;
}) {
  const id = `installment-${name}`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="number"
        step="0.01"
        min={allowNegative ? undefined : "0"}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
