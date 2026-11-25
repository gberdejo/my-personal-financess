"use client";

import { cn } from "@/lib/utils";
import type { MovementKind } from "@/lib/labels";

const OPTIONS: { value: MovementKind | null; label: string; dot?: string }[] = [
  { value: null, label: "Todos" },
  { value: "INCOME", label: "Ingresos", dot: "bg-income" },
  { value: "EXPENSE", label: "Gastos", dot: "bg-expense" },
];

// Tipo de movimiento (segmentado): `null` es "Todos". El punto usa el color con el que se
// ve cada tipo en la lista (verde petróleo ingreso, cobre gasto). "Gastos" no incluye los
// pagos de tarjeta, que solo salen en "Todos".
export function MovementKindFilter({
  value,
  onChange,
  className,
}: {
  value: MovementKind | null;
  onChange: (next: MovementKind | null) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Tipo de movimiento"
      className={cn("grid h-9 grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5 sm:inline-grid sm:w-auto", className)}
    >
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              selected
                ? "bg-background font-medium text-foreground ring-1 ring-foreground/10"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.dot && <span aria-hidden className={cn("size-1.5 rounded-full", option.dot)} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
