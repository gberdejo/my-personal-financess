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
import { LoanInfoFields, type LoanInfoValues } from "@/components/finance/loan-info-fields";
import { updateLoanInfo } from "@/features/loans/actions";

type Option = { id: string; name: string };

export function LoanInfoDialog({
  scheduledPaymentId,
  initial,
  active,
  accounts,
  categories,
}: {
  scheduledPaymentId: string;
  initial: LoanInfoValues;
  active: boolean;
  accounts: Option[];
  categories: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [state, formAction, pending] = useActionState(updateLoanInfo.bind(null, scheduledPaymentId), null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setValues(initial);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Pencil className="size-4" />
          <span className="sr-only">Editar préstamo</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar préstamo</DialogTitle>
          <DialogDescription>Estos datos no cambian el cronograma de cuotas.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <LoanInfoFields values={values} onChange={setValues} accounts={accounts} categories={categories} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={active} className="size-4 accent-primary" />
            Mostrar en el calendario
          </label>
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
