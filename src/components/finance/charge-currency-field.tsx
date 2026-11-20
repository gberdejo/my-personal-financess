"use client";

import { useLastExchangeRate, useMarketRate } from "@/components/finance/credit-cards-context";
import { cn } from "@/lib/utils";
import { toSoles } from "@/lib/currency";
import { parseDateOnly } from "@/lib/date";
import { formatCurrency, formatDayMonth, formatRate } from "@/lib/format";

export type ChargeCurrency = "PEN" | "USD";

// Toggle chico `S/ | US$` de la moneda de un consumo con tarjeta. Se envía como `currency`.
export function ChargeCurrencyToggle({
  currency,
  onCurrencyChange,
}: {
  currency: ChargeCurrency;
  onCurrencyChange: (currency: ChargeCurrency) => void;
}) {
  return (
    <div role="group" aria-label="Moneda del consumo" className="flex h-8 shrink-0 rounded-lg bg-muted p-0.5 text-xs font-medium">
      <input type="hidden" name="currency" value={currency} />
      {(["PEN", "USD"] as const).map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={currency === item}
          onClick={() => onCurrencyChange(item)}
          className={cn(
            "rounded-md px-2.5 transition-colors",
            currency === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          {item === "PEN" ? "S/" : "US$"}
        </button>
      ))}
    </div>
  );
}

// Textos de un consumo en dólares (debajo del monto). En dólares,
// el monto del formulario es en US$ y el servidor calcula los soles: con el tipo de
// cambio del consumo si ya se pagó (`ownRate`), o con el del BCRP del día o, si no hay,
// el del último pago en dólares. El usuario no ingresa ningún TC acá: el real va al pagar la tarjeta.
export function ChargeCurrencyHint({
  currency,
  amount,
  ownRate = null,
}: {
  currency: ChargeCurrency;
  // Lo que se está escribiendo en el campo de monto.
  amount: string;
  // Tipo de cambio con el que ya se pagó este consumo.
  ownRate?: number | null;
}) {
  const lastRate = useLastExchangeRate();
  const market = useMarketRate();
  const marketRate = ownRate === null ? (market?.rate ?? null) : null;
  const marketDate = market ? parseDateOnly(market.date) : null;
  const marketLabel = marketRate !== null && marketDate ? `TC BCRP ${formatRate(marketRate)} del ${formatDayMonth(marketDate)}` : null;
  const knownRate = ownRate ?? marketRate ?? lastRate;
  const rate = knownRate;
  const usd = Number(amount);

  if (currency !== "USD") return null;

  return (
    <div className="flex flex-col gap-1.5">
      {rate !== null && usd > 0 ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          {ownRate !== null
            ? `${formatCurrency(toSoles(usd, rate))} · TC ${formatRate(rate)}`
            : `≈ ${formatCurrency(toSoles(usd, rate))} (estimado con ${marketLabel ?? `TC ${formatRate(rate)}`})`}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {knownRate === null
            ? "Los soles se estiman con el tipo de cambio del BCRP al guardar."
            : marketLabel
              ? `Los soles se estiman con el ${marketLabel}.`
              : `Los soles se estiman con el TC ${formatRate(knownRate)} de tu último pago en dólares.`}
        </p>
      )}
    </div>
  );
}
