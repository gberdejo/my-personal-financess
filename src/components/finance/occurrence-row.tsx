import { Check, Minus } from "lucide-react";
import { OccurrenceDialog } from "@/components/finance/occurrence-dialog";
import type { CalendarEntry, OccurrenceStatusView } from "@/features/schedule/queries";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type AccountOption = { id: string; name: string };

// Mismo lenguaje que Presupuestos: punteado = pendiente, relleno con check = pagado.
export function OccurrenceStatusMark({ status, className }: { status: OccurrenceStatusView; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full",
        status === "PAID" && "bg-expense text-background",
        status === "SKIPPED" && "bg-muted text-muted-foreground",
        status === "PENDING" && "border-[1.5px] border-dashed border-muted-foreground/50",
        status === "OVERDUE" && "border-[1.5px] border-dashed border-destructive",
        className
      )}
    >
      {status === "PAID" && <Check className="size-[60%]" strokeWidth={3} />}
      {status === "SKIPPED" && <Minus className="size-[60%]" strokeWidth={3} />}
    </span>
  );
}

export function occurrenceAmountClass(status: OccurrenceStatusView) {
  return cn(
    "tabular-nums",
    status === "PAID" && "text-expense",
    status === "OVERDUE" && "text-destructive",
    status === "SKIPPED" && "text-muted-foreground line-through"
  );
}

// Fila de lista que abre el detalle de la cuota.
export function OccurrenceRow({
  entry,
  accounts,
  detail,
}: {
  entry: CalendarEntry;
  accounts: AccountOption[];
  detail: string;
}) {
  return (
    <li>
      <OccurrenceDialog entry={entry} accounts={accounts}>
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
        >
          <OccurrenceStatusMark status={entry.status} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{entry.name}</p>
            <p className="truncate text-xs text-muted-foreground">{detail}</p>
          </div>
          <span className={cn("shrink-0 text-sm font-semibold", occurrenceAmountClass(entry.status))}>
            {formatCurrency(entry.amount)}
          </span>
        </button>
      </OccurrenceDialog>
    </li>
  );
}
