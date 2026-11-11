"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
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
import { createScheduledPayment, updateScheduledPayment } from "@/features/schedule/actions";

export type CardFormValues = {
  id: string;
  name: string;
  // Cierre y pago del próximo estado de cuenta, "YYYY-MM-DD".
  closingDate: string;
  dueDate: string;
  active: boolean;
};

// Alta y edición de una tarjeta de crédito. Una tarjeta es un pago programado
// de tipo CREDIT_CARD: sus vencimientos aparecen en el calendario.
export function CardFormDialog({ card }: { card?: CardFormValues }) {
  const isEdit = Boolean(card);
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    card ? updateScheduledPayment.bind(null, card.id) : createScheduledPayment,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
      if (!isEdit) formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state, isEdit]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="outline" size="sm">
            <Pencil />
            Editar
          </Button>
        ) : (
          <Button>
            <Plus />
            Nueva tarjeta
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar tarjeta" : "Nueva tarjeta de crédito"}</DialogTitle>
          <DialogDescription>
            Con sus fechas de cierre y pago se arman los ciclos de facturación: cuánto consumiste en cada uno y cuándo
            pagarlo. El pago aparece en el calendario.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="type" value="CREDIT_CARD" />

          <div className="flex flex-col gap-2">
            <Label htmlFor="card-name">Nombre</Label>
            <Input id="card-name" name="name" placeholder="Ej. Visa BCP" defaultValue={card?.name} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="card-closing-date">Fecha de cierre</Label>
              <Input
                id="card-closing-date"
                name="closingDate"
                type="date"
                defaultValue={card?.closingDate}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="card-due-date">Fecha de pago</Label>
              <Input id="card-due-date" name="dueDate" type="date" defaultValue={card?.dueDate} required />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Las de tu próximo estado de cuenta. Si el banco las mueve cada mes, cargalas en el cronograma de
            facturación de la tarjeta.
          </p>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={card?.active} className="size-4 accent-primary" />
              Activa (se puede elegir en los gastos y su pago sale en el calendario)
            </label>
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
