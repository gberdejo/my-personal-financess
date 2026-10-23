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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaymentMethodSelect } from "@/components/finance/payment-method-select";
import type { RouletteActionState } from "@/features/roulette/actions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

// Registra la comisión de uno o varios ruleteos como gasto. `action` llega ya
// enlazada a la operación (o al vencimiento, si es masivo).
export function RegisterRouletteDialog({
  action,
  bulk = false,
  description,
  fees,
  accounts,
  categories,
  defaultAccountId,
  defaultCategoryId,
}: {
  action: (prevState: RouletteActionState, formData: FormData) => Promise<RouletteActionState>;
  bulk?: boolean;
  description: string;
  fees: number;
  accounts: Option[];
  categories: Option[];
  defaultAccountId: string | null;
  defaultCategoryId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "");
  const [state, formAction, pending] = useActionState(action, null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={bulk ? "default" : "outline"}
          size={bulk ? "default" : "sm"}
          className={cn(bulk && "bg-expense text-background hover:bg-expense/90")}
        >
          {bulk ? "Registrar las de hoy" : "Registrar"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{bulk ? "Registrar comisiones" : "Registrar comisión"}</DialogTitle>
          <DialogDescription>La comisión se guarda como un gasto en Transacciones.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4 rounded-lg bg-muted/60 p-3">
            <p className="min-w-0 text-sm">{description}</p>
            <span className="shrink-0 text-lg font-semibold text-expense tabular-nums">{formatCurrency(fees)}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="register-account">Cuenta</Label>
              <Select name="accountId" value={accountId} onValueChange={setAccountId} required>
                <SelectTrigger id="register-account" className="w-full">
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
              <Label htmlFor="register-category">Categoría</Label>
              <Select name="categoryId" value={categoryId} onValueChange={setCategoryId} required>
                <SelectTrigger id="register-category" className="w-full">
                  <SelectValue placeholder="Elegí una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* La comisión se cobra en la tarjeta con la que se hace el ruleteo. */}
          <PaymentMethodSelect id="register-method" defaultValue="CREDIT_CARD" />

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending || accounts.length === 0}>
              {pending ? "Registrando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
