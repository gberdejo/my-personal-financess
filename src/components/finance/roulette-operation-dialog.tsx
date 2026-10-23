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
import { RouletteProviderFields } from "@/components/finance/roulette-provider-fields";
import { saveRouletteOperation } from "@/features/roulette/actions";
import type { RouletteProvider } from "@/features/roulette/queries";
import { formatCurrency } from "@/lib/format";
import { rouletteFee, rouletteReceived } from "@/lib/roulette";

type OperationValues = {
  id: string;
  // "YYYY-MM-DD"
  date: string;
  provider: string;
  feeRate: number;
  charge: number;
};

function toPercent(rate: number) {
  return String(Math.round(rate * 10000) / 100);
}

export function RouletteOperationDialog({
  scheduledPaymentId,
  dueDateValue,
  providers,
  defaultDate,
  operation,
}: {
  scheduledPaymentId: string;
  dueDateValue: string;
  providers: RouletteProvider[];
  // "YYYY-MM-DD" propuesto al agregar.
  defaultDate: string;
  // Al editar.
  operation?: OperationValues;
}) {
  const isEdit = Boolean(operation);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState(operation?.provider ?? providers[0]?.name ?? "");
  const [feePercent, setFeePercent] = useState(
    operation ? toPercent(operation.feeRate) : providers[0] ? toPercent(providers[0].feeRate) : ""
  );
  const [charge, setCharge] = useState(operation?.charge.toString() ?? "");
  const [state, formAction, pending] = useActionState(
    saveRouletteOperation.bind(null, scheduledPaymentId, dueDateValue, operation?.id ?? null),
    null
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
      if (!isEdit) setCharge("");
    }
    wasPending.current = pending;
  }, [pending, state, isEdit]);

  const chargeValue = Number(charge) || 0;
  const rate = (Number(feePercent) || 0) / 100;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
            <Pencil className="size-3.5" />
            <span className="sr-only">Editar operación</span>
          </Button>
        ) : (
          <Button variant="outline">
            <Plus />
            Agregar operación
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar operación" : "Nueva operación"}</DialogTitle>
          <DialogDescription>Lo que cargás a la tarjeta; te llega ese monto menos la comisión.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="operation-date">Fecha</Label>
              <Input
                id="operation-date"
                name="date"
                type="date"
                defaultValue={operation?.date ?? defaultDate}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="operation-charge">Cargo a la tarjeta (S/)</Label>
              <Input
                id="operation-charge"
                name="charge"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={charge}
                onChange={(e) => setCharge(e.target.value)}
                required
              />
            </div>
          </div>

          <RouletteProviderFields
            providers={providers}
            provider={provider}
            feePercent={feePercent}
            onProviderChange={setProvider}
            onFeePercentChange={setFeePercent}
          />

          {chargeValue > 0 && (
            <p className="text-sm text-muted-foreground">
              Comisión{" "}
              <span className="font-medium text-expense tabular-nums">
                {formatCurrency(rouletteFee(chargeValue, rate))}
              </span>{" "}
              · te llegan{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatCurrency(rouletteReceived(chargeValue, rate))}
              </span>
            </p>
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
