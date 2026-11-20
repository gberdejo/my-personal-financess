"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
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
import { useLastExchangeRate, useMarketRate } from "@/components/finance/credit-cards-context";
import { PaymentMethodSelect } from "@/components/finance/payment-method-select";
import {
  acknowledgeCardCycleChange,
  payOccurrence,
  skipOccurrence,
  undoOccurrence,
} from "@/features/schedule/actions";
import { payCardPart, undoCardPart } from "@/features/cards/payments";
import type { CalendarEntry, PartView } from "@/features/schedule/queries";
import { parseDateOnly, shiftDay, todayInLima, toUTCDateInputValue } from "@/lib/date";
import {
  formatCurrency,
  formatDate,
  formatDayMonth,
  formatRate,
  formatEntryAmount,
  formatMixed,
  formatTransactionDate,
  formatUsd,
} from "@/lib/format";

type AccountOption = { id: string; name: string };

const STATUS_LABELS: Record<CalendarEntry["status"], string> = {
  PENDING: "Pendiente",
  OVERDUE: "Vencido",
  PARTIAL: "Pagado en parte",
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
  const today = toUTCDateInputValue(todayInLima());
  const [accountId, setAccountId] = useState(entry.accountId ?? "");
  // Ya está en Transacciones: solo se marca, sin crear otro gasto (servicios y préstamos).
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
      setAccountId(entry.accountId ?? "");
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

  function acknowledge() {
    startTransition(async () => {
      await acknowledgeCardCycleChange(entry.scheduledPaymentId, entry.dueDateValue);
    });
  }

  const isCard = entry.type === "CREDIT_CARD";
  // Tarjeta: se resuelve por partes; solo "omitida" usa el texto de resuelto.
  const resolved = isCard ? entry.status === "SKIPPED" : entry.status === "PAID" || entry.status === "SKIPPED";
  const parts = entry.parts;
  const anySettled = !!parts && (parts.pen.settled || parts.usd.settled);

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
                Consumos del {formatDate(entry.cycle.start)} al {formatDate(shiftDay(entry.cycle.end, -1))}
                {entry.cycle.open && " · ciclo en curso"}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span className="text-lg font-semibold text-expense tabular-nums">{formatEntryAmount(entry)}</span>
            {entry.status === "PAID" && (entry.amountPen !== entry.estimated || entry.amountUsd !== entry.estimatedUsd) && (
              <span className="text-xs text-muted-foreground tabular-nums">
                estimado {formatMixed(entry.estimated, entry.estimatedUsd)}
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
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <Link
              href={`/dashboard/tarjetas/${entry.scheduledPaymentId}/${entry.dueDateValue}`}
              className="flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Deuda del estado de cuenta
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}

        {resolved ? (
          <div className="flex flex-col gap-4">
            {entry.cycleChange && (
              <CycleChangeNotice change={entry.cycleChange} pending={otherPending} onAcknowledge={acknowledge} />
            )}
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
        ) : isCard && parts ? (
          <div className="flex flex-col gap-4">
            {entry.cycleChange && (
              <CycleChangeNotice change={entry.cycleChange} pending={otherPending} onAcknowledge={acknowledge} />
            )}
            <CardPartSection entry={entry} part="PEN" view={parts.pen} accounts={accounts} />
            <CardPartSection entry={entry} part="USD" view={parts.usd} accounts={accounts} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2">
              {anySettled ? (
                <Button variant="outline" onClick={undo} disabled={otherPending}>
                  {otherPending ? "Deshaciendo…" : "Deshacer todo"}
                </Button>
              ) : (
                <Button variant="ghost" onClick={skip} disabled={otherPending}>
                  Omitir esta vez
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`pay-amount-${entry.key}`}>Monto real (S/)</Label>
              <Input
                id={`pay-amount-${entry.key}`}
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                defaultValue={entry.amount > 0 ? entry.amount.toFixed(2) : undefined}
                required
              />
            </div>

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

            {markOnly ? (
              <p className="text-xs text-muted-foreground">
                No se crea otro gasto. Usalo para cuotas que pagaste antes de cargarlas acá.
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
                    <Input id={`pay-date-${entry.key}`} name="date" type="date" defaultValue={today} required />
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
              <Button type="submit" disabled={pending || otherPending || (!markOnly && accounts.length === 0)}>
                {pending ? "Registrando…" : markOnly ? "Marcar como pagada" : "Registrar pago"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Un apartado (soles o dólares) del vencimiento de una tarjeta: se paga, se marca
// o se deshace sin tocar el otro.
function CardPartSection({
  entry,
  part,
  view,
  accounts,
}: {
  entry: CalendarEntry;
  part: "PEN" | "USD";
  view: PartView;
  accounts: AccountOption[];
}) {
  const isUsd = part === "USD";
  const money = isUsd ? formatUsd : formatCurrency;
  const title = isUsd ? "Dólares" : "Soles";
  const today = toUTCDateInputValue(todayInLima());
  const [expanded, setExpanded] = useState(false);
  const [markOnly, setMarkOnly] = useState(false);
  const [accountId, setAccountId] = useState(entry.accountId ?? "");
  // TC controlado: arranca con el del BCRP (o tu último pago) y los botones de abajo lo cambian.
  const market = useMarketRate();
  const lastRate = useLastExchangeRate();
  const [rate, setRate] = useState(String(market?.rate ?? lastRate ?? ""));
  const marketDate = market ? parseDateOnly(market.date) : null;
  const [state, formAction, pending] = useActionState(
    payCardPart.bind(null, entry.scheduledPaymentId, entry.dueDateValue, part),
    null
  );
  const [undoing, startTransition] = useTransition();

  function undo() {
    startTransition(async () => {
      await undoCardPart(entry.scheduledPaymentId, entry.dueDateValue, part);
      setExpanded(false);
    });
  }

  let status: string;
  if (view.settled) {
    if (view.amount <= 0) status = "Sin deuda";
    else if (view.markOnly) status = `Marcado como pagado (${money(view.amount)})`;
    else {
      status = `Pagado ${money(view.amount)}`;
      if (view.paidOn) status += ` el ${formatTransactionDate(view.paidOn)}`;
      if (view.accountName) status += ` desde ${view.accountName}`;
    }
  } else {
    status = view.pending > 0 ? `Pendiente ${money(view.pending)}` : "Sin deuda";
  }

  const id = `${entry.key}-${part}`;
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{status}</p>
        </div>
        {view.settled ? (
          <Button type="button" variant="outline" size="sm" onClick={undo} disabled={undoing}>
            {undoing ? "Deshaciendo…" : "Deshacer"}
          </Button>
        ) : (
          !expanded && (
            <Button type="button" size="sm" onClick={() => setExpanded(true)}>
              Pagar {title.toLowerCase()}
            </Button>
          )
        )}
      </div>

      {!view.settled && expanded && (
        <form action={formAction} className="flex flex-col gap-3">
          <div className={isUsd ? "grid grid-cols-2 gap-4" : "flex flex-col gap-2"}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`pay-amount-${id}`}>{isUsd ? "Monto en US$" : "Monto en S/"}</Label>
              <Input
                id={`pay-amount-${id}`}
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                defaultValue={view.pending > 0 ? view.pending.toFixed(2) : undefined}
                required
              />
            </div>
            {isUsd && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`pay-rate-${id}`}>TC real (tu banco)</Label>
                <Input
                  id={`pay-rate-${id}`}
                  name="exchangeRate"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  inputMode="decimal"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  required
                />
              </div>
            )}
          </div>
          {!isUsd && entry.cycle?.open && (
            <p className="text-xs text-muted-foreground">
              El ciclo todavía no cerró: el monto puede subir con nuevos consumos.
            </p>
          )}
          {isUsd && (market || lastRate !== null) && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {market && marketDate && (
                <>
                  TC BCRP venta del {formatDayMonth(marketDate)}:{" "}
                  <button
                    type="button"
                    onClick={() => setRate(String(market.rate))}
                    className="font-medium text-primary hover:underline"
                  >
                    {formatRate(market.rate)}
                  </button>
                </>
              )}
              {market && marketDate && lastRate !== null && " · "}
              {lastRate !== null && (
                <>
                  tu último pago:{" "}
                  <button
                    type="button"
                    onClick={() => setRate(String(lastRate))}
                    className="font-medium text-primary hover:underline"
                  >
                    {formatRate(lastRate)}
                  </button>
                </>
              )}
            </p>
          )}
          {isUsd && (
            <p className="text-xs text-muted-foreground">
              El tipo de cambio es obligatorio, también con “solo marcar”: los consumos en dólares del ciclo quedan con él.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="markOnly"
              checked={markOnly}
              onChange={(event) => setMarkOnly(event.target.checked)}
              className="size-4 accent-primary"
            />
            Solo marcar como pagado (ya está en Transacciones)
          </label>
          {!markOnly && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`pay-account-${id}`}>Cuenta</Label>
                <Select name="accountId" value={accountId} onValueChange={setAccountId} required>
                  <SelectTrigger id={`pay-account-${id}`} className="w-full">
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
                <Label htmlFor={`pay-date-${id}`}>Fecha de pago</Label>
                <Input id={`pay-date-${id}`} name="date" type="date" defaultValue={today} required />
              </div>
            </div>
          )}
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pending || (!markOnly && accounts.length === 0)}>
              {pending ? "Registrando…" : markOnly ? "Marcar como pagado" : "Registrar"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

// La tarjeta se marcó como pagada y después cambiaron los gastos de su ciclo
// (se editó, agregó o borró un gasto con tarjeta).
function CycleChangeNotice({
  change,
  pending,
  onAcknowledge,
}: {
  change: NonNullable<CalendarEntry["cycleChange"]>;
  pending: boolean;
  onAcknowledge: () => void;
}) {
  // Qué cambió en cada moneda (con signo).
  const diffs = [
    { value: change.after - change.before, format: formatCurrency },
    { value: change.afterUsd - change.beforeUsd, format: formatUsd },
  ]
    .filter((d) => Math.abs(d.value) >= 0.005)
    .map((d) => `${d.value > 0 ? "+" : "−"}${d.format(Math.abs(d.value))}`)
    .join(" ");
  return (
    <div className="flex flex-col gap-2 rounded-md bg-amber-500/10 px-3 py-2.5 text-sm">
      <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
        <TriangleAlert className="size-4 shrink-0" />
        Los gastos del ciclo cambiaron después de marcarla
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">
        Al marcarla sumaban {formatMixed(change.before, change.beforeUsd)}; ahora suman{" "}
        {formatMixed(change.after, change.afterUsd)} ({diffs}). Revisá si lo que pagaste cubre la deuda; si no, deshacé y volvé a marcarla
        con el monto correcto.
      </p>
      <Button variant="outline" size="sm" className="self-end" onClick={onAcknowledge} disabled={pending}>
        Entendido
      </Button>
    </div>
  );
}
