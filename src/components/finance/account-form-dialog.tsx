"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
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
import { createAccount } from "@/features/accounts/actions";

export function AccountFormDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createAccount, null);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Agregar cuenta de ahorro
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva cuenta de ahorro</DialogTitle>
          <DialogDescription>
            Todos los movimientos salen o entran de una cuenta de ahorro. La tarjeta, Yape o efectivo se
            eligen como método de pago en cada gasto.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="account-name">Nombre</Label>
            <Input id="account-name" name="name" placeholder="Ej. BCP Cuenta Sueldo" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="account-initial-balance">Saldo inicial (S/)</Label>
            <Input
              id="account-initial-balance"
              name="initialBalance"
              type="number"
              step="0.01"
              defaultValue="0"
              inputMode="decimal"
            />
          </div>
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
