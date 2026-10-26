"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaymentMethodSelect } from "@/components/finance/payment-method-select";
import { payOccurrence, skipOccurrence, undoOccurrence } from "@/features/schedule/actions";
import type { CalendarEntry } from "@/features/schedule/queries";
import { shiftDay, todayInLima, toUTCDateInputValue } from "@/lib/date";
import { formatCurrency, formatDate, formatTransactionDate } from "@/lib/format";

type AccountOption = { id: string; name: string };

const STATUS_LABELS: Record<CalendarEntry["status"], string> = {
  PENDING: "Pendiente",
  OVERDUE: "Vencido",
  PAID: "Pagado",
  SKIPPED: "Omitido",
};

// Detalle de una cuota del calendario. `children` es el disparador.
export function OccurrenceDialog({
  entry,
  accounts,
  children,
}: {
  entry: CalendarEntry;
  accounts: AccountOption[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(entry.accountId ?? "");
  // Ya está en Transacciones: solo se marca, sin crear otro gasto.
  const [markOnly, setMarkOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    payOccurrence.bind(null, entry.scheduledPaymentId, entry.dueDateValue),
    null
  );
  const [otherPending, startTransition] = useTransition();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setMarkOnly(false);
    }
  }

  function skip() {
    startTransition(async () => {
      const result = await skipOccurrence(entry.scheduledPaymentId, entry.dueDateValue);
      if (result?.error) setError(result.error);
      else setOpen(false);
    });
  }

  function undo() {
    startTransition(async () => {
      await undoOccurrence(entry.scheduledPaymentId, entry.dueDateValue);
      setOpen(false);
    });
  }

  const isCard = entry.type === "CREDIT_CARD";
  const resolved = entry.status === "PAID" || entry.status === "SKIPPED";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry.name}</DialogTitle>
          <DialogDescription>
            Vence el {formatTransactionDate(entry.dueDate)} · {STATUS_LABELS[entry.status]}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start justify-between gap-4 rounded-lg bg-muted/60 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{entry.categoryName ?? "Tarjeta de crédito"}</p>
            {entry.statementAmount !== null ? (
              <p className="text-xs text-muted-foreground">Deuda del estado de cuenta</p>
            ) : entry.cycle && (
              <p className="text-xs text-muted-foreground">
                Gastos con tarjeta del {formatDate(entry.cycle.start)} al {formatDate(shiftDay(entry.cycle.end, -1))}
                {entry.cycle.open && " · ciclo en curso"}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span className="text-lg font-semibold text-expense tabular-nums">{formatCurrency(entry.amount)}</span>
            {entry.status === "PAID" && entry.amount !== entry.estimated && (
              <span className="text-xs text-muted-foreground tabular-nums">
                estimado {formatCurrency(entry.estimated)}
              </span>
            )}
          </div>
        </div>

        {entry.installment && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground tabular-nums">
              Cuota {entry.installment.number}/{entry.installment.count} · capital{" "}
              {formatCurrency(entry.installment.principal)} · interés {formatCurrency(entry.installment.interest)}
              {entry.installment.insurance > 0 && ` · seguros ${formatCurrency(entry.installment.insurance)}`}
            </span>
            <Link
              href={`/dashboard/prestamos/${entry.scheduledPaymentId}`}
              className="flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Ver préstamo
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}

        {isCard && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {entry.roulette ? (
                <>
                  Ruleteado{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatCurrency(entry.roulette.received)}
                  </span>{" "}
                  · comisiones{" "}
                  <span className="font-medium text-expense tabular-nums">{formatCurrency(entry.roulette.fees)}</span>
                </>
              ) : (
                "Sin ruleteo planificado"
              )}
            </span>
            <Link
              href={`/dashboard/calendario/pago/${entry.scheduledPaymentId}/${entry.dueDateValue}`}
              className="flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Deuda y ruleteo
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}

        {resolved ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {entry.status === "SKIPPED"
                ? "Esta cuota se omitió. Al deshacer vuelve a quedar pendiente."
                : entry.transactionId
                  ? "Se registró como gasto en Transacciones. Al deshacer se borra ese gasto y la cuota vuelve a quedar pendiente."
                  : "Marcada como pagada. Al deshacer vuelve a quedar pendiente."}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={undo} disabled={otherPending}>
                {otherPending ? "Deshaciendo…" : "Deshacer"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`pay-amount-${entry.key}`}>{isCard ? "Monto pagado (S/)" : "Monto real (S/)"}</Label>
              <Input
                id={`pay-amount-${entry.key}`}
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                defaultValue={entry.amount > 0 ? entry.amount : undefined}
                required
              />
              {isCard && entry.cycle?.open && (
                <p className="text-xs text-muted-foreground">
                  El ciclo todavía no cerró: el monto puede subir con nuevos gastos.
                </p>
              )}
            </div>

            {!isCard && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="markOnly"
                  checked={markOnly}
                  onChange={(e) => setMarkOnly(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Ya está en Transacciones: solo marcar como pagada
              </label>
            )}

            {isCard || markOnly ? (
              <p className="text-xs text-muted-foreground">
                {isCard
                  ? "Solo se marca como pagada: los gastos de la tarjeta ya están registrados en Transacciones."
                  : "No se crea otro gasto. Usalo para cuotas que pagaste antes de cargarlas acá."}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`pay-account-${entry.key}`}>Cuenta</Label>
                    <Select name="accountId" value={accountId} onValueChange={setAccountId} required>
                      <SelectTrigger id={`pay-account-${entry.key}`} className="w-full">
                        <SelectValue placeholder="Elegí una cuenta" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`pay-date-${entry.key}`}>Fecha de pago</Label>
                    <Input
                      id={`pay-date-${entry.key}`}
                      name="date"
                      type="date"
                      defaultValue={toUTCDateInputValue(todayInLima())}
                      required
                    />
                  </div>
                </div>
                <PaymentMethodSelect id={`pay-method-${entry.key}`} defaultValue={entry.paymentMethod} />
              </>
            )}

            {(state?.error || error) && <p className="text-sm text-destructive">{state?.error ?? error}</p>}

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={skip} disabled={otherPending || pending}>
                Omitir esta vez
              </Button>
              <Button
                type="submit"
                disabled={pending || otherPending || (!isCard && !markOnly && accounts.length === 0)}
              >
                {pending ? "Registrando…" : isCard || markOnly ? "Marcar como pagada" : "Registrar pago"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
