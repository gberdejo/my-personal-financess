"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
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
import { LoanCsvImport } from "@/components/finance/loan-csv-import";
import { importLoanSchedule } from "@/features/loans/actions";

// Reemplaza el cronograma de un préstamo con un CSV (ej. el que da el banco
// después de un prepago). Las cuotas pagadas se conservan.
export function ImportScheduleDialog({ scheduledPaymentId, paidCount }: { scheduledPaymentId: string; paidCount: number }) {
  const [open, setOpen] = useState(false);
  const [valid, setValid] = useState(false);
  const [state, formAction, pending] = useActionState(importLoanSchedule.bind(null, scheduledPaymentId), null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setValid(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload />
          Importar cronograma
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar cronograma</DialogTitle>
          <DialogDescription>
            Reemplaza las cuotas sin pagar con las del archivo, tal cual vienen.
            {paidCount > 0 &&
              ` ${paidCount === 1 ? "La cuota pagada se conserva" : `Las ${paidCount} cuotas pagadas se conservan`}, aunque el archivo traiga esas fechas.`}
          </DialogDescription>
        </DialogHeader>
        {/* `key` reinicia la vista previa cada vez que se abre. */}
        <form key={String(open)} action={formAction} className="flex flex-col gap-4">
          <LoanCsvImport onValidChange={setValid} />
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending || !valid}>
              {pending ? "Importando…" : "Reemplazar cuotas"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
