"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCardStatement } from "@/features/cards/actions";
import { formatCurrency, formatUsd } from "@/lib/format";

// Deuda del estado de cuenta de un vencimiento. Vacía = se usa el estimado.
export function CardStatementForm({
  scheduledPaymentId,
  dueDateValue,
  statementAmount,
  statementAmountUsd,
  estimated,
  estimatedUsd,
}: {
  scheduledPaymentId: string;
  dueDateValue: string;
  statementAmount: number | null;
  statementAmountUsd: number | null;
  estimated: number;
  estimatedUsd: number;
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
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="statement-amount">Deuda del estado de cuenta (S/)</Label>
          <Input
            id="statement-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder={estimated > 0 ? estimated.toFixed(2) : "0.00"}
            defaultValue={statementAmount && statementAmount > 0 ? statementAmount : undefined}
            onChange={() => setSaved(false)}
            className="max-w-48"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="statement-amount-usd">Deuda en US$ (opcional)</Label>
          <Input
            id="statement-amount-usd"
            name="amountUsd"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder={estimatedUsd > 0 ? estimatedUsd.toFixed(2) : "0.00"}
            defaultValue={statementAmountUsd ?? undefined}
            onChange={() => setSaved(false)}
            className="max-w-48"
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Guardando…" : saved ? "Guardado" : "Guardar"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {statementAmount === null
          ? `Sin deuda ingresada: se usa el estimado con tus gastos con tarjeta (${formatCurrency(estimated)}${estimatedUsd > 0 ? ` + ${formatUsd(estimatedUsd)}` : ""}).`
          : `Estimado con tus gastos con tarjeta: ${formatCurrency(estimated)}${estimatedUsd > 0 ? ` + ${formatUsd(estimatedUsd)}` : ""}. Dejalo vacío para usar el estimado. Si solo ingresás dólares, la deuda en soles queda en S/ 0.00.`}
      </p>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
