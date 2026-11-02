"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { BanknoteArrowDown, Pencil } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { deletePrepayment, savePrepayment } from "@/features/loans/actions";
import { PREPAYMENT_MODE_LABELS } from "@/lib/labels";
import { PREPAYMENT_MODES, type PrepaymentMode } from "@/lib/loan";
import { cn } from "@/lib/utils";

const MODE_HINTS: Record<PrepaymentMode, string> = {
  TERM: "La cuota sigue igual y terminás de pagar antes.",
  INSTALLMENT: "Las fechas siguen igual y las cuotas siguientes bajan.",
};

type PrepaymentValues = {
  id: string;
  // "YYYY-MM-DD"
  date: string;
  amount: number;
  mode: PrepaymentMode;
  note: string | null;
};

// Agrega o edita un prepago (planificado o ya hecho). Al guardar, las cuotas
// siguientes se recalculan. Editándolo también se puede eliminar.
export function PrepaymentDialog({
  scheduledPaymentId,
  prepayment,
  defaultDate,
}: {
  scheduledPaymentId: string;
  prepayment?: PrepaymentValues;
  // "YYYY-MM-DD" propuesto al agregar.
  defaultDate: string;
}) {
  const isEdit = Boolean(prepayment);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PrepaymentMode>(prepayment?.mode ?? "TERM");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [state, formAction, pending] = useActionState(
    savePrepayment.bind(null, scheduledPaymentId, prepayment?.id ?? null),
    null
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setMode(prepayment?.mode ?? "TERM");
      setDeleteError(null);
    }
  }

  function remove() {
    if (!prepayment) return;
    startDelete(async () => {
      const result = await deletePrepayment(prepayment.id);
      if (result?.error) setDeleteError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
            <Pencil className="size-3.5" />
            <span className="sr-only">Editar prepago</span>
          </Button>
        ) : (
          <Button variant="outline">
            <BanknoteArrowDown />
            Agregar prepago
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar prepago" : "Nuevo prepago"}</DialogTitle>
          <DialogDescription>
            Un pago extra a capital, hecho o planificado. Las cuotas siguientes se recalculan con la tasa del préstamo.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {PREPAYMENT_MODES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === option ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {PREPAYMENT_MODE_LABELS[option]}
              </button>
            ))}
          </div>
          <input type="hidden" name="mode" value={mode} />
          <p className="-mt-2 text-xs text-muted-foreground">{MODE_HINTS[mode]}</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="prepayment-date">Fecha</Label>
              <Input
                id="prepayment-date"
                name="date"
                type="date"
                defaultValue={prepayment?.date ?? defaultDate}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="prepayment-amount">Monto (S/)</Label>
              <Input
                id="prepayment-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                defaultValue={prepayment?.amount}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="prepayment-note">Nota (opcional)</Label>
            <Textarea
              id="prepayment-note"
              name="note"
              rows={2}
              placeholder="Ej. Con la gratificación"
              defaultValue={prepayment?.note ?? undefined}
            />
          </div>

          {(state?.error || deleteError) && (
            <p className="text-sm text-destructive">{state?.error ?? deleteError}</p>
          )}

          <DialogFooter className="gap-2">
            {isEdit && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive sm:mr-auto"
                onClick={remove}
                disabled={deleting || pending}
              >
                {deleting ? "Eliminando…" : "Eliminar prepago"}
              </Button>
            )}
            <Button type="submit" disabled={pending || deleting}>
              {pending ? "Recalculando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
