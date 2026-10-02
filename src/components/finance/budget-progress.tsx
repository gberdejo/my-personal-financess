import { formatCurrency } from "@/lib/format";

// Cuánto del plan ya se convirtió en gasto real. Si lo aplicado supera lo
// planificado, la barra se llena y el excedente se muestra en el texto.
export function BudgetProgress({ planned, applied }: { planned: number; applied: number }) {
  const percentage = planned > 0 ? Math.min((applied / planned) * 100, 100) : applied > 0 ? 100 : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentage)}
        aria-label={`${percentage.toFixed(0)}% del presupuesto aplicado`}
      >
        <div className="h-full rounded-full bg-expense" style={{ width: `${percentage}%` }} />
      </div>
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-expense tabular-nums">{formatCurrency(applied)}</span> aplicado
        </span>
        <span className="tabular-nums">de {formatCurrency(planned)}</span>
      </div>
    </div>
  );
}
