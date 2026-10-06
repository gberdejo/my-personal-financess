"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/labels";
import type { PaymentMethod } from "@/generated/prisma/client";

// Campo "Método de pago" de los formularios de gasto. Se envía como `paymentMethod`.
export function PaymentMethodSelect({
  id,
  defaultValue,
}: {
  id: string;
  defaultValue?: PaymentMethod | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Método de pago</Label>
      <Select name="paymentMethod" defaultValue={defaultValue ?? undefined} required>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="¿Cómo pagaste?" />
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_METHODS.map((method) => (
            <SelectItem key={method} value={method}>
              {PAYMENT_METHOD_LABELS[method]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
