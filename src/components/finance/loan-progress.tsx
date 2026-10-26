import { formatCurrency } from "@/lib/format";

// Cuánto capital ya se devolvió. Tras un periodo de gracia el saldo puede
// superar al monto prestado: la barra queda en 0 hasta que baje.
export function LoanProgress({ principal, balance }: { principal: number; balance: number }) {
  const repaid = Math.max(0, principal - balance);
  const percentage = principal > 0 ? Math.min((repaid / principal) * 100, 100) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentage)}
        aria-label={`${percentage.toFixed(0)}% del capital devuelto`}
      >
        <div className="h-full rounded-full bg-income" style={{ width: `${percentage}%` }} />
      </div>
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>
          Saldo <span className="font-semibold text-foreground tabular-nums">{formatCurrency(balance)}</span>
        </span>
        <span className="tabular-nums">de {formatCurrency(principal)}</span>
      </div>
    </div>
  );
}
