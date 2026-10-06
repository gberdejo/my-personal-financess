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
import { applyPendingBudgetItems } from "@/features/budgets/actions";
import { toDateInputValue } from "@/lib/date";
import { formatCurrency } from "@/lib/format";

type AccountOption = { id: string; name: string };
type PendingItem = { id: string; description: string; categoryName: string; amount: number };

export function ApplyPendingBudgetDialog({
  budgetId,
  items,
  skippedCount,
  accounts,
  defaultAccountId,
}: {
  budgetId: string;
  // Solo las líneas pendientes con monto: las que se van a crear.
  items: PendingItem[];
  // Pendientes con monto 0, que no se aplican.
  skippedCount: number;
  accounts: AccountOption[];
  defaultAccountId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");
  const [state, formAction, pending] = useActionState(applyPendingBudgetItems.bind(null, budgetId), null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const count = items.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={count === 0} className="bg-expense text-background hover:bg-expense/90">
          Aplicar pendientes ({count})
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Se {count === 1 ? "creará 1 gasto" : `crearán ${count} gastos`} por {formatCurrency(total)}
          </DialogTitle>
          <DialogDescription>
            Cada uno en su categoría, por el monto planificado. Si alguno costó distinto, aplicalo por separado para
            ajustar el monto.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <ul className="flex max-h-56 flex-col divide-y overflow-y-auto rounded-lg border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.description}</p>
                  <p className="text-xs text-muted-foreground">{item.categoryName}</p>
                </div>
                <span className="shrink-0 font-medium text-expense tabular-nums">{formatCurrency(item.amount)}</span>
              </li>
            ))}
          </ul>
          {skippedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {skippedCount === 1 ? "1 gasto sin monto no se aplica." : `${skippedCount} gastos sin monto no se aplican.`}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="apply-pending-account">Cuenta</Label>
              <Select name="accountId" value={accountId} onValueChange={setAccountId} required>
                <SelectTrigger id="apply-pending-account" className="w-full">
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
              <Label htmlFor="apply-pending-date">Fecha</Label>
              <Input
                id="apply-pending-date"
                name="date"
                type="date"
                defaultValue={toDateInputValue(new Date())}
                required
              />
            </div>
          </div>

          <PaymentMethodSelect id="apply-pending-payment-method" />

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button
              type="submit"
              disabled={pending || accounts.length === 0}
              className="bg-expense text-background hover:bg-expense/90"
            >
              {pending ? "Aplicando…" : count === 1 ? "Crear 1 gasto" : `Crear ${count} gastos`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
