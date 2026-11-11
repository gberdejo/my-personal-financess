"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreditCards } from "@/components/finance/credit-cards-context";
import { NO_PAYMENT_METHOD_LABEL, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/labels";
import type { CardFilter, PaymentMethodFilter as PaymentMethodFilterValue } from "@/features/transactions/queries";

const ALL = "ALL";
// Las tarjetas van como "CARD:<id>" debajo de Tarjeta de crédito.
const CARD_PREFIX = "CARD:";

// Filtra la lista de transacciones por método de pago vía `?method=` y, con
// tarjeta de crédito, por tarjeta vía `?tarjeta=`, conservando el periodo.
export function PaymentMethodFilter({
  value,
  card,
}: {
  value: PaymentMethodFilterValue | null;
  card: CardFilter | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cards = useCreditCards();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams);
    params.delete("tarjeta");
    if (next === ALL) params.delete("method");
    else if (next.startsWith(CARD_PREFIX)) {
      params.set("method", "CREDIT_CARD");
      params.set("tarjeta", next.slice(CARD_PREFIX.length));
    } else params.set("method", next);
    router.push(`/dashboard/transacciones?${params.toString()}`);
  }

  const selected = card ? `${CARD_PREFIX}${card}` : (value ?? ALL);

  return (
    <Select value={selected} onValueChange={handleChange}>
      <SelectTrigger className="w-44" aria-label="Filtrar por método de pago">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todos los métodos</SelectItem>
        <SelectSeparator />
        {PAYMENT_METHODS.map((method) => [
          <SelectItem key={method} value={method}>
            {PAYMENT_METHOD_LABELS[method]}
          </SelectItem>,
          method === "CREDIT_CARD"
            ? cards.map((c) => (
                <SelectItem key={c.id} value={`${CARD_PREFIX}${c.id}`} className="pl-6">
                  {c.name}
                </SelectItem>
              ))
            : null,
        ])}
        <SelectItem value="NONE">{NO_PAYMENT_METHOD_LABEL}</SelectItem>
      </SelectContent>
    </Select>
  );
}
