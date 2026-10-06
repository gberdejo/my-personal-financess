"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
import { applyBudgetItem } from "@/features/budgets/actions";
import { toDateInputValue } from "@/lib/date";
import { formatCurrency } from "@/lib/format";

type AccountOption = { id: string; name: string };

export function ApplyBudgetItemDialog({
  item,
  accounts,
  defaultAccountId,
}: {
  item: { id: string; description: string; categoryName: string; amount: number };
  accounts: AccountOption[];
  defaultAccountId: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Sin monto planificado no hay nada que confirmar: se abre directo en modo ajuste.
  const [adjusting, setAdjusting] = useState(item.amount <= 0);
  const [amount, setAmount] = useState(item.amount > 0 ? item.amount.toString() : "");
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");
  const [state, formAction, pending] = useActionState(applyBudgetItem.bind(null, item.id), null);
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
      setAdjusting(item.amount <= 0);
      setAmount(item.amount > 0 ? item.amount.toString() : "");
    }
  }

  const difference = (Number(amount) || 0) - item.amount;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Aplicar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar gasto</DialogTitle>
          <DialogDescription>Se registra como un gasto real en Transacciones.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4 rounded-lg bg-muted/60 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.description}</p>
              <p className="text-xs text-muted-foreground">{item.categoryName}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-lg font-semibold text-expense tabular-nums">
                {formatCurrency(adjusting ? Number(amount) || 0 : item.amount)}
              </span>
              {adjusting && item.amount > 0 && difference !== 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  planificado {formatCurrency(item.amount)}
                </span>
              )}
            </div>
          </div>

          {adjusting ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`apply-amount-${item.id}`}>Monto real (S/)</Label>
              <Input
                id={`apply-amount-${item.id}`}
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                required
              />
              {item.amount > 0 && difference !== 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {difference > 0 ? "Gastás " : "Ahorrás "}
                  {formatCurrency(Math.abs(difference))} {difference > 0 ? "más" : "menos"} de lo planificado.
                </p>
              )}
            </div>
          ) : (
            <input type="hidden" name="amount" value={item.amount} />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`apply-account-${item.id}`}>Cuenta</Label>
              <Select name="accountId" value={accountId} onValueChange={setAccountId} required>
                <SelectTrigger id={`apply-account-${item.id}`} className="w-full">
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
              <Label htmlFor={`apply-date-${item.id}`}>Fecha</Label>
              <Input
                id={`apply-date-${item.id}`}
                name="date"
                type="date"
                defaultValue={toDateInputValue(new Date())}
                required
              />
            </div>
          </div>

          <PaymentMethodSelect id={`apply-payment-method-${item.id}`} />

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter className="gap-2">
            {!adjusting && (
              <Button type="button" variant="outline" onClick={() => setAdjusting(true)}>
                Ajustar monto
              </Button>
            )}
            <Button type="submit" disabled={pending || accounts.length === 0}>
              {pending ? "Aplicando…" : "Aplicar gasto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
