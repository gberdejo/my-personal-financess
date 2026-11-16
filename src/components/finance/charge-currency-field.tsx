"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLastExchangeRate } from "@/components/finance/credit-cards-context";
import { toSoles } from "@/lib/currency";
import { formatCurrency, formatRate } from "@/lib/format";

export type ChargeCurrency = "PEN" | "USD";

// Moneda de un consumo con tarjeta (S/ o US$). Se envía como `currency`. En dólares,
// el monto del formulario es en US$ y el servidor calcula los soles: con el tipo de
// cambio del consumo si ya se pagó (`ownRate`), o con el del último pago en dólares.
// Si nunca hubo uno, pide un "TC referencial" (`referenceRate`) una sola vez.
export function ChargeCurrencyField({
  id,
  currency,
  onCurrencyChange,
  amount,
  ownRate = null,
}: {
  id: string;
  currency: ChargeCurrency;
  onCurrencyChange: (currency: ChargeCurrency) => void;
  // Lo que se está escribiendo en el campo de monto.
  amount: string;
  // Tipo de cambio con el que ya se pagó este consumo.
  ownRate?: number | null;
}) {
  const lastRate = useLastExchangeRate();
  const [reference, setReference] = useState("");
  const knownRate = ownRate ?? lastRate;
  const rate = knownRate ?? (Number(reference) > 0 ? Number(reference) : null);
  const usd = Number(amount);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Moneda del consumo</Label>
      <Select name="currency" value={currency} onValueChange={(value) => onCurrencyChange(value as ChargeCurrency)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="PEN">Soles (S/)</SelectItem>
          <SelectItem value="USD">Dólares (US$)</SelectItem>
        </SelectContent>
      </Select>

      {currency === "USD" && (
        <>
          {knownRate === null && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-rate`}>TC referencial</Label>
              <Input
                id={`${id}-rate`}
                name="referenceRate"
                type="number"
                step="0.0001"
                min="0.0001"
                inputMode="decimal"
                placeholder="Ej. 3.75"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                className="tabular-nums"
                required
              />
              <p className="text-xs text-muted-foreground">
                Solo para estimar los soles. El tipo de cambio real lo pones al pagar la tarjeta.
              </p>
            </div>
          )}
          {rate !== null && usd > 0 ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              {ownRate !== null
                ? `${formatCurrency(toSoles(usd, rate))} · TC ${formatRate(rate)}`
                : `≈ ${formatCurrency(toSoles(usd, rate))} (estimado con TC ${formatRate(rate)})`}
            </p>
          ) : (
            knownRate !== null && (
              <p className="text-xs text-muted-foreground">
                Los soles se estiman con el TC {formatRate(knownRate)} de tu último pago en dólares.
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}
