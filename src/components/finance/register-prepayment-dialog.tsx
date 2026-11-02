"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { registerPrepayment, undoPrepayment } from "@/features/loans/actions";
import { formatCurrency } from "@/lib/format";
import type { PaymentMethod } from "@/generated/prisma/client";

type AccountOption = { id: string; name: string };

// Registra el gasto de un prepago. Las cuotas ya lo tienen en cuenta.
export function RegisterPrepaymentDialog({
  prepayment,
  accounts,
  defaultAccountId,
  defaultPaymentMethod,
}: {
  prepayment: { id: string; amount: number; date: string; label: string };
  accounts: AccountOption[];
  defaultAccountId: string | null;
  defaultPaymentMethod: PaymentMethod | null;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");
  const [state, formAction, pending] = useActionState(registerPrepayment.bind(null, prepayment.id), null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Registrar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar prepago</DialogTitle>
          <DialogDescription>Se guarda como un gasto en Transacciones.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4 rounded-lg bg-muted/60 p-3">
            <p className="min-w-0 text-sm">{prepayment.label}</p>
            <span className="shrink-0 text-lg font-semibold text-expense tabular-nums">
              {formatCurrency(prepayment.amount)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`prepayment-account-${prepayment.id}`}>Cuenta</Label>
              <Select name="accountId" value={accountId} onValueChange={setAccountId} required>
                <SelectTrigger id={`prepayment-account-${prepayment.id}`} className="w-full">
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
              <Label htmlFor={`prepayment-paid-${prepayment.id}`}>Fecha de pago</Label>
              <Input
                id={`prepayment-paid-${prepayment.id}`}
                name="date"
                type="date"
                defaultValue={prepayment.date}
                required
              />
            </div>
          </div>
          <PaymentMethodSelect id={`prepayment-method-${prepayment.id}`} defaultValue={defaultPaymentMethod} />
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending || accounts.length === 0}>
              {pending ? "Registrando…" : "Registrar gasto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UndoPrepaymentButton({ prepaymentId }: { prepaymentId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          Deshacer
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Deshacer el registro?</AlertDialogTitle>
          <AlertDialogDescription>
            Se borra el gasto de Transacciones y el prepago vuelve a quedar planificado. Las cuotas no cambian.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={() => startTransition(() => undoPrepayment(prepaymentId))}>
            Deshacer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
