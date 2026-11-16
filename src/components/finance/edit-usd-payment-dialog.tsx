"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
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
import { updateTransaction } from "@/features/transactions/actions";
import { toSoles } from "@/lib/currency";
import { formatCurrency } from "@/lib/format";

// Edita el pago en dólares de una tarjeta: monto en US$, tipo de cambio y fecha.
// Los soles se recalculan y el consumo del ciclo queda con el nuevo tipo de cambio.
export function EditUsdPaymentDialog({
  transactionId,
  currentDate,
  currentUsd,
  currentRate,
}: {
  transactionId: string;
  currentDate: string;
  currentUsd: number;
  currentRate: number;
}) {
  const [open, setOpen] = useState(false);
  const [usd, setUsd] = useState(currentUsd.toFixed(2));
  const [rate, setRate] = useState(String(currentRate));
  const [state, formAction, pending] = useActionState(updateTransaction.bind(null, transactionId), null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setUsd(currentUsd.toFixed(2));
      setRate(String(currentRate));
    }
  }

  const soles = Number(usd) > 0 && Number(rate) > 0 ? toSoles(Number(usd), Number(rate)) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Pencil className="size-4" />
          <span className="sr-only">Editar pago en dólares</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar pago en dólares</DialogTitle>
          <DialogDescription>
            Al cambiar el monto o el tipo de cambio se actualizan los soles y el total del periodo.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="usd-pay-amount">Monto (US$)</Label>
              <Input
                id="usd-pay-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={usd}
                onChange={(event) => setUsd(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="usd-pay-rate">Tipo de cambio</Label>
              <Input
                id="usd-pay-rate"
                name="exchangeRate"
                type="number"
                step="0.0001"
                min="0.0001"
                inputMode="decimal"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="usd-pay-date">Fecha</Label>
            <Input id="usd-pay-date" name="date" type="date" defaultValue={currentDate} required />
          </div>
          {soles !== null && (
            <p className="text-xs text-muted-foreground tabular-nums">Equivale a {formatCurrency(soles)}.</p>
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
