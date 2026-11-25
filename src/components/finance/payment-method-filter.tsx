"use client";

import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreditCards } from "@/components/finance/credit-cards-context";
import { NO_PAYMENT_METHOD_LABEL, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/labels";
import type { CardFilter, PaymentMethodFilter as PaymentMethodFilterValue } from "@/features/transactions/queries";

const ALL = "ALL";
// Las tarjetas van como "CARD:<id>" debajo de Tarjeta de crédito.
const CARD_PREFIX = "CARD:";

// Selector controlado de método de pago y, con tarjeta de crédito, de la tarjeta.
export function PaymentMethodFilter({
  value,
  card,
  onChange,
  disabled = false,
}: {
  value: PaymentMethodFilterValue | null;
  card: CardFilter | null;
  onChange: (next: { method: PaymentMethodFilterValue | null; card: CardFilter | null }) => void;
  // Con el tipo Ingresos: el método de pago solo existe en gastos.
  disabled?: boolean;
}) {
  const cards = useCreditCards();

  function handleChange(next: string) {
    if (next === ALL) onChange({ method: null, card: null });
    else if (next.startsWith(CARD_PREFIX)) onChange({ method: "CREDIT_CARD", card: next.slice(CARD_PREFIX.length) });
    else onChange({ method: next as PaymentMethodFilterValue, card: null });
  }

  const selected = card ? `${CARD_PREFIX}${card}` : (value ?? ALL);

  return (
    <Select value={selected} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger
        className="w-44"
        aria-label="Filtrar por método de pago"
        title={disabled ? "Solo aplica a gastos" : undefined}
      >
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
