"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, TriangleAlert, Undo2 } from "lucide-react";
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
import { AmountInput } from "@/components/finance/amount-input";
import { OccurrenceStatusMark, occurrenceAmountClass } from "@/components/finance/occurrence-row";
import { PaymentMethodSelect } from "@/components/finance/payment-method-select";
import {
  acknowledgeCardCycleChange,
  payOccurrence,
  skipOccurrence,
  undoOccurrence,
} from "@/features/schedule/actions";
import { payCardPart, undoCardPart } from "@/features/cards/payments";
import type { CalendarEntry, OccurrenceStatusView, PartView } from "@/features/schedule/queries";
import { parseDateOnly, shiftDay, todayInLima, toUTCDateInputValue } from "@/lib/date";
import { toSoles } from "@/lib/currency";
import { cn } from "@/lib/utils";
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
      setOpenPart(null);
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
  // Tarjeta: solo un formulario de pago abierto a la vez (soles o dólares).
  const [openPart, setOpenPart] = useState<"PEN" | "USD" | null>(null);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {isCard ? (
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-6">
              <DialogTitle>{entry.name}</DialogTitle>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <OccurrenceStatusMark status={entry.status} className="size-3.5" />
                {STATUS_LABELS[entry.status]}
              </span>
            </div>
            <DialogDescription>
              Vence el {formatTransactionDate(entry.dueDate)}
              {entry.cycle && (
                <>
                  {" · "}consumos del {formatDayMonth(entry.cycle.start)} al{" "}
                  {formatDayMonth(shiftDay(entry.cycle.end, -1))}
                  {entry.cycle.open && " (ciclo en curso)"}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
        ) : (
          <>
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
          </>
        )}

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
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  {entry.status === "PAID" ? "Lo que pagaste" : "Lo que debes"}
                </p>
                <Link
                  href={`/dashboard/tarjetas/${entry.scheduledPaymentId}/${entry.dueDateValue}`}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Estado de cuenta
                  <ArrowRight className="size-3" />
                </Link>
              </div>
              <div className="divide-y rounded-xl border">
                {(["PEN", "USD"] as const).map((part) => (
                  <CardPartRow
                    key={part}
                    entry={entry}
                    part={part}
                    view={part === "PEN" ? parts.pen : parts.usd}
                    accounts={accounts}
                    expanded={openPart === part}
                    onExpandedChange={(next) => setOpenPart(next ? part : null)}
                  />
                ))}
              </div>
            </div>
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

// Una moneda (soles o dólares) del vencimiento de una tarjeta, como una línea de un estado
// de cuenta: marca de estado, monto y una sola acción. Se paga, se marca o se deshace sin
// tocar la otra; el formulario se abre debajo de la fila.
function CardPartRow({
  entry,
  part,
  view,
  accounts,
  expanded,
  onExpandedChange,
}: {
  entry: CalendarEntry;
  part: "PEN" | "USD";
  view: PartView;
  accounts: AccountOption[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const isUsd = part === "USD";
  const money = isUsd ? formatUsd : formatCurrency;
  const title = isUsd ? "Dólares" : "Soles";
  const noDebt = view.settled ? view.amount <= 0 : view.pending <= 0;
  const [undoing, startTransition] = useTransition();

  function undo() {
    startTransition(async () => {
      await undoCardPart(entry.scheduledPaymentId, entry.dueDateValue, part);
      onExpandedChange(false);
    });
  }

  // La marca reutiliza la del calendario: pagada, pendiente o vencida.
  const mark: OccurrenceStatusView = view.settled ? "PAID" : entry.status === "OVERDUE" ? "OVERDUE" : "PENDING";
  const fromStatement = isUsd ? entry.statementAmountUsd !== null : entry.statementAmount !== null;

  let detail: string;
  // Dólares pagados: el TC y lo que salió en soles, en su propia línea.
  const conversion =
    isUsd && view.settled && !noDebt && entry.exchangeRate !== null
      ? `TC ${formatRate(entry.exchangeRate)} = ${formatCurrency(toSoles(view.amount, entry.exchangeRate))}`
      : null;
  if (noDebt) {
    detail = "Sin consumos en esta moneda";
  } else if (view.settled) {
    if (view.markOnly) detail = "Marcado como pagado";
    else {
      detail = "Pagado";
      if (view.paidOn) detail += ` el ${formatDayMonth(view.paidOn)}`;
      if (view.accountName) detail += ` desde ${view.accountName}`;
    }

  } else {
    detail = `${entry.status === "OVERDUE" ? "Vencido" : "Pendiente"} · ${
      fromStatement ? "según el estado de cuenta" : "estimado de consumos"
    }`;
    if (!isUsd && entry.cycle?.open) detail += " (puede subir)";
  }

  return (
    <section className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-3">
        <OccurrenceStatusMark status={noDebt ? "SKIPPED" : mark} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">{title}</p>
            <p
              className={cn(
                "text-base font-semibold",
                noDebt ? "text-muted-foreground tabular-nums" : occurrenceAmountClass(mark)
              )}
            >
              {money(view.settled ? view.amount : view.pending)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">{detail}</p>
          {conversion && <p className="text-xs text-muted-foreground tabular-nums">{conversion}</p>}
        </div>
        {view.settled && !noDebt ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={undo}
            disabled={undoing}
            className="text-muted-foreground hover:text-foreground"
            title={`Deshacer el pago en ${title.toLowerCase()}`}
          >
            <Undo2 className="size-4" />
            <span className="sr-only">Deshacer el pago en {title.toLowerCase()}</span>
          </Button>
        ) : (
          !view.settled &&
          !noDebt &&
          !expanded && (
            <Button type="button" size="sm" onClick={() => onExpandedChange(true)}>
              Pagar
            </Button>
          )
        )}
      </div>

      {!view.settled && expanded && (
        <CardPartForm entry={entry} part={part} pending={view.pending} accounts={accounts} onCancel={() => onExpandedChange(false)} />
      )}
    </section>
  );
}

// Formulario de pago de una moneda, abierto debajo de su fila.
function CardPartForm({
  entry,
  part,
  pending: amountDue,
  accounts,
  onCancel,
}: {
  entry: CalendarEntry;
  part: "PEN" | "USD";
  pending: number;
  accounts: AccountOption[];
  onCancel: () => void;
}) {
  const isUsd = part === "USD";
  const prefix = isUsd ? "US$" : "S/";
  const id = `${entry.key}-${part}`;
  const today = toUTCDateInputValue(todayInLima());
  const [amount, setAmount] = useState(amountDue > 0 ? amountDue.toFixed(2) : "");
  const [markOnly, setMarkOnly] = useState(false);
  const [accountId, setAccountId] = useState(entry.accountId ?? "");
  // TC controlado: arranca con el del BCRP (o tu último pago) y los botones lo cambian.
  const market = useMarketRate();
  const lastRate = useLastExchangeRate();
  const [rate, setRate] = useState(String(market?.rate ?? lastRate ?? ""));
  const marketDate = market ? parseDateOnly(market.date) : null;
  const [state, formAction, pending] = useActionState(
    payCardPart.bind(null, entry.scheduledPaymentId, entry.dueDateValue, part),
    null
  );

  const usd = Number(amount);
  const rateValue = Number(rate);
  const soles = isUsd && usd > 0 && rateValue > 0 ? toSoles(usd, rateValue) : null;
  const rateOptions = [
    market && marketDate ? { label: `BCRP ${formatDayMonth(marketDate)}`, value: market.rate } : null,
    lastRate !== null ? { label: "Tu último pago", value: lastRate } : null,
  ].filter((option): option is { label: string; value: number } => option !== null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
      <div className={isUsd ? "grid grid-cols-[1fr_7rem] gap-2" : "flex"}>
        <AmountInput id={`pay-amount-${id}`} prefix={prefix} value={amount} onChange={setAmount} />
        {isUsd && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`pay-rate-${id}`} className="sr-only">
              Tipo de cambio de tu banco
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs font-medium text-muted-foreground">
                TC
              </span>
              <Input
                id={`pay-rate-${id}`}
                name="exchangeRate"
                type="number"
                step="0.0001"
                min="0.0001"
                inputMode="decimal"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                className="h-11 pl-8 text-base tabular-nums"
                required
              />
            </div>
          </div>
        )}
      </div>

      {isUsd && (
        <div className="flex flex-col gap-1.5">
          {rateOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {rateOptions.map((option) => {
                const active = Number(rate) === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setRate(String(option.value))}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs tabular-nums transition-colors",
                      active
                        ? "border-primary/40 bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {option.label} {formatRate(option.value)}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground tabular-nums">
            {soles !== null ? (
              <>
                = <span className="font-medium text-foreground">{formatCurrency(soles)}</span>{" "}
                {markOnly ? "con el TC de tu banco" : "salen de tu cuenta"}
              </>
            ) : (
              "Poné el tipo de cambio que te cobró tu banco."
            )}
          </p>
        </div>
      )}

      {!markOnly && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`pay-account-${id}`} className="text-xs text-muted-foreground">
              Desde la cuenta
            </Label>
            <Select name="accountId" value={accountId} onValueChange={setAccountId} required>
              <SelectTrigger id={`pay-account-${id}`} className="w-full bg-background">
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`pay-date-${id}`} className="text-xs text-muted-foreground">
              Fecha de pago
            </Label>
            <Input id={`pay-date-${id}`} name="date" type="date" defaultValue={today} className="bg-background" required />
          </div>
        </div>
      )}

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          name="markOnly"
          checked={markOnly}
          onChange={(event) => setMarkOnly(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span>
          Solo marcar como pagado: ya está en Transacciones y no se crea otro pago.
          {isUsd && markOnly && " El TC se guarda igual: los consumos en dólares del ciclo quedan con él."}
        </span>
      </label>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pending || (!markOnly && accounts.length === 0)}>
          {pending
            ? "Registrando…"
            : markOnly
              ? "Marcar como pagado"
              : `Pagar ${usd > 0 ? (isUsd ? formatUsd(usd) : formatCurrency(usd)) : prefix}`}
        </Button>
      </div>
    </form>
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
