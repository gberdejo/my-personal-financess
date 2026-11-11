"use client";

import { useState } from "react";
import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreditCards } from "@/components/finance/credit-cards-context";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/labels";
import type { PaymentMethod } from "@/generated/prisma/client";

// Campo "Método de pago" de los formularios de gasto. Se envía como `paymentMethod`.
// Con tarjeta de crédito el gasto es un consumo: pide con qué tarjeta (`cardId`)
// y no sale de ninguna cuenta hasta que se paga el periodo de la tarjeta.
//
// `legacyAccountName`: al editar un gasto que salió de una cuenta. Si es (o pasa
// a ser) con tarjeta, sigue descontado de esa cuenta salvo que se marque
// "Pasar a consumo" (`asCharge`).
export function PaymentMethodSelect({
  id,
  defaultValue,
  defaultCardId,
  legacyAccountName,
  onMethodChange,
}: {
  id: string;
  defaultValue?: PaymentMethod | null;
  defaultCardId?: string | null;
  legacyAccountName?: string | null;
  onMethodChange?: (method: PaymentMethod) => void;
}) {
  const [method, setMethod] = useState<string>(defaultValue ?? "");
  const [asCharge, setAsCharge] = useState(false);
  const cards = useCreditCards();
  // Las tarjetas desactivadas solo aparecen si son la del gasto que se edita.
  const options = cards.filter((card) => card.active || card.id === defaultCardId);
  const isCard = method === "CREDIT_CARD";
  const isLegacy = legacyAccountName !== undefined;
  // Consumo: siempre al crear; al editar un gasto con cuenta, solo si se marca.
  const isCharge = isCard && (!isLegacy || asCharge);
  const cardDefault =
    (defaultCardId && options.some((c) => c.id === defaultCardId) ? defaultCardId : null) ??
    (options.length === 1 ? options[0].id : undefined);

  function handleChange(value: string) {
    setMethod(value);
    onMethodChange?.(value as PaymentMethod);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Método de pago</Label>
      <Select name="paymentMethod" defaultValue={defaultValue ?? undefined} onValueChange={handleChange} required>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="¿Cómo pagaste?" />
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_METHODS.map((option) => (
            <SelectItem key={option} value={option}>
              {PAYMENT_METHOD_LABELS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isCard &&
        (options.length > 0 ? (
          <>
            <Select name="cardId" defaultValue={cardDefault} required={isCharge}>
              <SelectTrigger id={`${id}-card`} aria-label="Tarjeta" className="w-full">
                <SelectValue placeholder="¿Con qué tarjeta?" />
              </SelectTrigger>
              <SelectContent>
                {options.map((card) => (
                  <SelectItem key={card.id} value={card.id}>
                    {card.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLegacy && (
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  name="asCharge"
                  checked={asCharge}
                  onChange={(event) => setAsCharge(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span>
                  Pasar a consumo de la tarjeta: deja de restar de {legacyAccountName ?? "su cuenta"} y se paga con
                  el periodo.
                </span>
              </label>
            )}
            {isCharge && (
              <p className="text-xs text-muted-foreground">
                Es un consumo: no sale de ninguna cuenta hasta que pagues el periodo de la tarjeta.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Para registrar consumos con tarjeta, primero agregá tu tarjeta en{" "}
            <Link href="/dashboard/tarjetas" className="font-medium text-primary hover:underline">
              Tarjetas
            </Link>
            .
          </p>
        ))}
    </div>
  );
}
