"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RouletteProvider } from "@/features/roulette/queries";

// Proveedor (con sugerencias de los ya usados) y su comisión en %. Elegir un
// proveedor conocido completa su última comisión. Se envían como
// `provider` y `feePercent`.
export function RouletteProviderFields({
  providers,
  provider,
  feePercent,
  onProviderChange,
  onFeePercentChange,
}: {
  providers: RouletteProvider[];
  provider: string;
  feePercent: string;
  onProviderChange: (value: string) => void;
  onFeePercentChange: (value: string) => void;
}) {
  const id = useId();

  function handleProvider(value: string) {
    onProviderChange(value);
    const known = providers.find((p) => p.name.toLowerCase() === value.trim().toLowerCase());
    if (known) onFeePercentChange(String(Math.round(known.feeRate * 10000) / 100));
  }

  return (
    <div className="grid grid-cols-[1fr_7rem] gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-provider`}>Proveedor</Label>
        <Input
          id={`${id}-provider`}
          name="provider"
          list={`${id}-providers`}
          placeholder="Nombre del servicio"
          value={provider}
          onChange={(e) => handleProvider(e.target.value)}
          autoComplete="off"
          required
        />
        <datalist id={`${id}-providers`}>
          {providers.map((p) => (
            <option key={p.name} value={p.name} />
          ))}
        </datalist>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-fee`}>Comisión %</Label>
        <Input
          id={`${id}-fee`}
          name="feePercent"
          type="number"
          step="0.01"
          min="0"
          max="20"
          inputMode="decimal"
          value={feePercent}
          onChange={(e) => onFeePercentChange(e.target.value)}
          required
        />
      </div>
    </div>
  );
}
