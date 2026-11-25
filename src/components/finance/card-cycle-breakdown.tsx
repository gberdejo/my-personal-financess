import { OccurrenceStatusMark } from "@/components/finance/occurrence-row";
import type { CalendarEntry } from "@/features/schedule/queries";
import { toSoles } from "@/lib/currency";
import { formatCurrency, formatDayMonth, formatRate, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

type Charge = { currency: "PEN" | "USD"; amount: number; foreignAmount: number | null };

// Ciclo de una tarjeta por moneda: cuánto se consumió y cuánto se pagó, en soles y en
// dólares, como las columnas de un estado de cuenta. Abajo, el total en soles de ambos.
export function CardCycleBreakdown({
  spent,
  charges,
  entry,
}: {
  // Consumos del ciclo en su moneda (`pen` en S/, `usd` en US$).
  spent: { pen: number; usd: number };
  charges: Charge[];
  // Vencimiento del ciclo (null si es anterior a la tarjeta).
  entry: CalendarEntry | null;
}) {
  const counts = {
    PEN: charges.filter((c) => c.currency === "PEN").length,
    USD: charges.filter((c) => c.currency === "USD").length,
  };
  // Los consumos en dólares en soles: exactos si ya se pagaron, si no estimados.
  const usdInSoles = charges.filter((c) => c.currency === "USD").reduce((sum, c) => sum + c.amount, 0);
  const rate = entry?.exchangeRate ?? null;
  const parts = entry?.parts ?? null;

  const paidPen = parts?.pen.settled ? parts.pen.amount : 0;
  const paidUsd = parts?.usd.settled ? parts.usd.amount : 0;
  const paidUsdInSoles = paidUsd > 0 && rate !== null ? toSoles(paidUsd, rate) : 0;

  const rows = [
    { key: "PEN" as const, label: "Soles", spent: spent.pen, count: counts.PEN, part: parts?.pen ?? null, money: formatCurrency },
    { key: "USD" as const, label: "Dólares", spent: spent.usd, count: counts.USD, part: parts?.usd ?? null, money: formatUsd },
  ];

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-[5rem_1fr_1fr] gap-3 border-b bg-muted/40 px-3 py-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase sm:grid-cols-[7rem_1fr_1.4fr]">
        <span />
        <span>Consumido</span>
        <span>Pagado</span>
      </div>

      {rows.map((row) => {
        const part = row.part;
        const noDebt = !part || (part.settled ? part.amount <= 0 : part.pending <= 0);
        return (
          <div
            key={row.key}
            className="grid grid-cols-[5rem_1fr_1fr] items-start gap-3 border-b px-3 py-2.5 sm:grid-cols-[7rem_1fr_1.4fr]"
          >
            <span className="pt-0.5 text-sm font-medium">{row.label}</span>

            <div className="flex flex-col">
              <span className={cn("font-semibold tabular-nums", row.spent > 0 ? "text-expense" : "text-muted-foreground")}>
                {row.money(row.spent)}
              </span>
              <span className="text-xs text-muted-foreground">
                {row.count === 0 ? "Sin consumos" : row.count === 1 ? "1 consumo" : `${row.count} consumos`}
              </span>
            </div>

            <div className="flex min-w-0 items-start gap-2">
              {!part ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : part.settled && !noDebt ? (
                <>
                  <OccurrenceStatusMark status="PAID" className="mt-0.5 size-4" />
                  <div className="flex min-w-0 flex-col">
                    <span className="font-semibold text-expense tabular-nums">{row.money(part.amount)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {part.markOnly
                        ? "Marcado como pagado"
                        : [part.paidOn && formatDayMonth(part.paidOn), part.accountName].filter(Boolean).join(" · ")}
                    </span>
                    {row.key === "USD" && rate !== null && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        TC {formatRate(rate)} = {formatCurrency(toSoles(part.amount, rate))}
                      </span>
                    )}
                  </div>
                </>
              ) : noDebt ? (
                <span className="text-sm text-muted-foreground">Sin deuda</span>
              ) : (
                <>
                  <OccurrenceStatusMark status={entry?.status === "OVERDUE" ? "OVERDUE" : "PENDING"} className="mt-0.5 size-4" />
                  <div className="flex min-w-0 flex-col">
                    <span
                      className={cn(
                        "text-sm",
                        entry?.status === "OVERDUE" ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {entry?.status === "OVERDUE" ? "Vencido" : "Pendiente"}
                    </span>
                    {Math.abs(part.pending - row.spent) >= 0.005 && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Debes {row.money(part.pending)} según el estado de cuenta
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="grid grid-cols-[5rem_1fr_1fr] items-start gap-3 px-3 py-2.5 sm:grid-cols-[7rem_1fr_1.4fr]">
        <span className="pt-0.5 text-xs text-muted-foreground">Total en S/</span>
        <div className="flex flex-col">
          <span className="text-sm font-medium tabular-nums">
            {spent.usd > 0 && rate === null && "≈ "}
            {formatCurrency(spent.pen + usdInSoles)}
          </span>
          {spent.usd > 0 && rate === null && (
            <span className="text-xs text-muted-foreground">dólares estimados</span>
          )}
        </div>
        <span className="text-sm font-medium tabular-nums">
          {paidPen + paidUsdInSoles > 0 ? formatCurrency(paidPen + paidUsdInSoles) : "—"}
        </span>
      </div>
    </div>
  );
}
