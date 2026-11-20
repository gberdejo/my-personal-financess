"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Monto grande con el prefijo de moneda dentro del campo. Se envía como `name`.
export function AmountInput({
  id,
  name = "amount",
  prefix,
  value,
  onChange,
  locked,
}: {
  id: string;
  name?: string;
  prefix: string;
  value: string;
  onChange: (value: string) => void;
  // Monto fijo (prepago): se muestra en lugar del campo y no se envía.
  locked?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Label htmlFor={id} className="sr-only">
        Monto ({prefix})
      </Label>
      {locked ? (
        <p
          id={id}
          className="flex h-11 items-center gap-2 rounded-lg border border-input bg-muted/60 px-3 text-2xl font-semibold tabular-nums"
        >
          {locked}
        </p>
      ) : (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted-foreground">
            {prefix}
          </span>
          <Input
            id={id}
            name={name}
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-11 pl-11 text-2xl font-semibold tabular-nums md:text-2xl"
            required
          />
        </div>
      )}
    </div>
  );
}
