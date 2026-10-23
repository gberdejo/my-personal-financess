"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCardStatement } from "@/features/roulette/actions";
import { formatCurrency } from "@/lib/format";

// Deuda del estado de cuenta de un vencimiento. Vacía = se usa el estimado.
export function CardStatementForm({
  scheduledPaymentId,
  dueDateValue,
  statementAmount,
  estimated,
}: {
  scheduledPaymentId: string;
  dueDateValue: string;
  statementAmount: number | null;
  estimated: number;
}) {
  const [saved, setSaved] = useState(false);
  const [state, formAction, pending] = useActionState(
    saveCardStatement.bind(null, scheduledPaymentId, dueDateValue),
    null
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setSaved(true);
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="statement-amount">Deuda del estado de cuenta (S/)</Label>
      <div className="flex gap-2">
        <Input
          id="statement-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder={estimated > 0 ? estimated.toFixed(2) : "0.00"}
          defaultValue={statementAmount ?? undefined}
          onChange={() => setSaved(false)}
          className="max-w-48"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Guardando…" : saved ? "Guardado" : "Guardar"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {statementAmount === null
          ? `Sin deuda ingresada: se usa el estimado con tus gastos con tarjeta (${formatCurrency(estimated)}).`
          : `Estimado con tus gastos con tarjeta: ${formatCurrency(estimated)}. Dejalo vacío para usar el estimado.`}
      </p>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
