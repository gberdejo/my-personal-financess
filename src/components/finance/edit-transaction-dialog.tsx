"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
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
import { PaymentMethodSelect } from "@/components/finance/payment-method-select";
import { updateTransaction } from "@/features/transactions/actions";
import type { PaymentMethod, TransactionKind } from "@/generated/prisma/client";

export function EditTransactionDialog({
  transactionId,
  kind,
  currentDate,
  currentPaymentMethod,
}: {
  transactionId: string;
  kind: TransactionKind;
  currentDate: string;
  currentPaymentMethod: PaymentMethod | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateTransaction.bind(null, transactionId),
    null
  );
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
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Pencil className="size-4" />
          <span className="sr-only">Editar movimiento</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar movimiento</DialogTitle>
          <DialogDescription>
            {kind === "EXPENSE"
              ? "Por ahora se puede modificar la fecha y el método de pago."
              : "Por ahora solo se puede modificar la fecha."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-tx-date">Fecha</Label>
            <Input id="edit-tx-date" name="date" type="date" defaultValue={currentDate} required />
          </div>

          {kind === "EXPENSE" && (
            <PaymentMethodSelect id="edit-tx-payment-method" defaultValue={currentPaymentMethod} />
          )}

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
