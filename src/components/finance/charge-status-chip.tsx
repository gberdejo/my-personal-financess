import { cn } from "@/lib/utils";

// Estado de un consumo con tarjeta: pendiente hasta que se paga su periodo.
export function ChargeStatusChip({ status, className }: { status: "PENDING" | "PAID"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        status === "PAID"
          ? "bg-muted text-muted-foreground"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        className
      )}
    >
      {status === "PAID" ? "Pagado" : "Pendiente de pago"}
    </span>
  );
}
