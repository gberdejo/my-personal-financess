"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
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
import { linkCardTransactions } from "@/features/cards/actions";
import type { LinkCandidate } from "@/features/cards/queries";
import { formatCurrency, formatTransactionDate } from "@/lib/format";
import { NO_PAYMENT_METHOD_LABEL, PAYMENT_METHOD_LABELS } from "@/lib/labels";

// Cómo se pagó hoy y de dónde salió (la cuenta, o la otra tarjeta si ya es un consumo).
function sourceLabel(candidate: LinkCandidate) {
  const method = candidate.paymentMethod ? PAYMENT_METHOD_LABELS[candidate.paymentMethod] : NO_PAYMENT_METHOD_LABEL;
  if (!candidate.accountName) return candidate.cardName ? `Consumo de ${candidate.cardName}` : method;
  return `${method} · ${candidate.accountName}`;
}

// Gastos ya registrados del ciclo que no son consumos de esta tarjeta. Al
// pasarlos quedan como consumos: método tarjeta de crédito, esta tarjeta y sin
// cuenta (dejan de restar de la cuenta de donde salían).
export function LinkCardTransactionsDialog({
  cardId,
  cardName,
  candidates,
}: {
  cardId: string;
  cardName: string;
  candidates: LinkCandidate[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState(linkCardTransactions.bind(null, cardId), null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
      setSelected(new Set());
    }
    wasPending.current = pending;
  }, [pending, state]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const total = candidates.filter((c) => selected.has(c.id)).reduce((sum, c) => sum + c.amount, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 />
          Pasar gastos a la tarjeta
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pasar gastos a {cardName}</DialogTitle>
          <DialogDescription>
            Gastos del ciclo que ya registraste. Al pasarlos quedan como consumos de {cardName}: dejan de restar de su
            cuenta y se pagan cuando pagues el periodo.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay otros gastos en este ciclo.</p>
          ) : (
            <ul className="-mx-1 flex max-h-80 flex-col overflow-y-auto">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-2 hover:bg-muted/60">
                    <input
                      type="checkbox"
                      name="transactionId"
                      value={candidate.id}
                      checked={selected.has(candidate.id)}
                      onChange={() => toggle(candidate.id)}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{candidate.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatTransactionDate(candidate.date)} · {candidate.categoryName} ·{" "}
                        <span className={candidate.legacyCard ? "text-amber-700 dark:text-amber-400" : undefined}>
                          {sourceLabel(candidate)}
                        </span>
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-expense tabular-nums">
                      -{formatCurrency(candidate.amount)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter className="items-center sm:justify-between">
            <span className="text-xs text-muted-foreground tabular-nums">
              {selected.size > 0 && `${selected.size} elegidos · ${formatCurrency(total)}`}
            </span>
            <Button type="submit" disabled={pending || selected.size === 0}>
              {pending ? "Pasando…" : "Pasar a la tarjeta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
