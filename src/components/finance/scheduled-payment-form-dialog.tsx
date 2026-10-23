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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createScheduledPayment, updateScheduledPayment } from "@/features/schedule/actions";
import { todayInLima, toUTCDateInputValue } from "@/lib/date";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  SCHEDULE_FREQUENCIES,
  SCHEDULE_FREQUENCY_LABELS,
  SCHEDULED_PAYMENT_TYPE_LABELS,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { PaymentMethod, ScheduledPaymentType, ScheduleFrequency } from "@/generated/prisma/client";

type Option = { id: string; name: string };

// Radix Select no admite value="" en un ítem.
const NONE = "none";

export type ScheduledPaymentValues = {
  id?: string;
  type: ScheduledPaymentType;
  name: string;
  categoryId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
  amount: number | null;
  frequency: ScheduleFrequency;
  // "YYYY-MM-DD"
  startDate: string;
  endDate: string | null;
  // Solo tarjeta: cierre y pago del próximo estado de cuenta, "YYYY-MM-DD".
  closingDate: string | null;
  dueDate: string | null;
  active: boolean;
};

export function ScheduledPaymentFormDialog({
  accounts,
  categories,
  payment,
  initial,
  hasCard = false,
}: {
  accounts: Option[];
  categories: Option[];
  // Al editar.
  payment?: ScheduledPaymentValues & { id: string };
  // Al crear desde una sugerencia.
  initial?: Partial<ScheduledPaymentValues>;
  // Ya hay una tarjeta programada: avisar que los gastos con tarjeta no se separan.
  hasCard?: boolean;
}) {
  const isEdit = Boolean(payment);
  const values = payment ?? initial;
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ScheduledPaymentType>(values?.type ?? "BILL");
  const [frequency, setFrequency] = useState<ScheduleFrequency>(values?.frequency ?? "MONTHLY");
  const [categoryId, setCategoryId] = useState(values?.categoryId ?? "");
  const [accountId, setAccountId] = useState(values?.accountId ?? NONE);
  const [paymentMethod, setPaymentMethod] = useState<string>(values?.paymentMethod ?? NONE);
  const [state, formAction, pending] = useActionState(
    payment ? updateScheduledPayment.bind(null, payment.id) : createScheduledPayment,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
      if (!isEdit && !initial) {
        formRef.current?.reset();
        setType("BILL");
        setFrequency("MONTHLY");
        setCategoryId("");
        setAccountId(NONE);
        setPaymentMethod(NONE);
      }
    }
    wasPending.current = pending;
  }, [pending, state, isEdit, initial]);

  const isCard = type === "CREDIT_CARD";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Pencil className="size-4" />
            <span className="sr-only">Editar pago programado</span>
          </Button>
        ) : initial ? (
          <Button variant="outline" size="sm">
            Programar
          </Button>
        ) : (
          <Button>
            <Plus />
            Nuevo pago
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar pago programado" : "Nuevo pago programado"}</DialogTitle>
          <DialogDescription>
            {isCard
              ? "Te avisa cuándo pagar la tarjeta y estima el monto con tus gastos con tarjeta del ciclo."
              : "Un servicio o gasto que se repite. Al pagarlo se registra como gasto en Transacciones."}
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          {!isEdit && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["BILL", "CREDIT_CARD"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setType(option)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    type === option ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {SCHEDULED_PAYMENT_TYPE_LABELS[option]}
                </button>
              ))}
            </div>
          )}
          <input type="hidden" name="type" value={type} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="schedule-name">Nombre</Label>
            <Input
              id="schedule-name"
              name="name"
              placeholder={isCard ? "Ej. Visa BCP" : "Ej. Luz, Internet, Alquiler"}
              defaultValue={values?.name}
              required
            />
          </div>

          {isCard ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="schedule-closing-date">Fecha de cierre</Label>
                  <Input
                    id="schedule-closing-date"
                    name="closingDate"
                    type="date"
                    defaultValue={values?.closingDate ?? undefined}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="schedule-due-date">Fecha de pago</Label>
                  <Input
                    id="schedule-due-date"
                    name="dueDate"
                    type="date"
                    defaultValue={values?.dueDate ?? undefined}
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Las de tu próximo estado de cuenta. Si el banco las mueve cada mes, cargalas en el cronograma de la
                tarjeta. El monto estimado suma los gastos con método “Tarjeta de crédito” entre un cierre y el
                siguiente.
                {hasCard && !isEdit && " Como los gastos no indican qué tarjeta se usó, todas tus tarjetas suman los mismos gastos."}
              </p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="schedule-category">Categoría</Label>
                  <Select name="categoryId" value={categoryId} onValueChange={setCategoryId} required>
                    <SelectTrigger id="schedule-category" className="w-full">
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
                <div className="flex flex-col gap-2">
                  <Label htmlFor="schedule-amount">Monto estimado (S/)</Label>
                  <Input
                    id="schedule-amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    defaultValue={values?.amount ?? undefined}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="schedule-frequency">Frecuencia</Label>
                  <Select
                    name="frequency"
                    value={frequency}
                    onValueChange={(value) => setFrequency(value as ScheduleFrequency)}
                  >
                    <SelectTrigger id="schedule-frequency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEDULE_FREQUENCIES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {SCHEDULE_FREQUENCY_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="schedule-start">{frequency === "ONCE" ? "Fecha" : "Primera fecha"}</Label>
                  <Input
                    id="schedule-start"
                    name="startDate"
                    type="date"
                    defaultValue={values?.startDate ?? toUTCDateInputValue(todayInLima())}
                    required
                  />
                </div>
              </div>

              {frequency !== "ONCE" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="schedule-end">Hasta (opcional)</Label>
                  <Input id="schedule-end" name="endDate" type="date" defaultValue={values?.endDate ?? undefined} />
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="schedule-account">{isCard ? "Pagás desde" : "Cuenta"}</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="schedule-account" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin definir</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="accountId" value={accountId === NONE ? "" : accountId} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="schedule-method">Método de pago</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="schedule-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin definir</SelectItem>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="paymentMethod" value={paymentMethod === NONE ? "" : paymentMethod} />
            </div>
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked={payment?.active}
                className="size-4 accent-primary"
              />
              Mostrar en el calendario
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
