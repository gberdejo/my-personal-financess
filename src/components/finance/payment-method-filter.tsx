"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NO_PAYMENT_METHOD_LABEL, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/labels";
import type { PaymentMethodFilter as PaymentMethodFilterValue } from "@/features/transactions/queries";

const ALL = "ALL";

// Filtra la lista de transacciones por método de pago vía `?method=`, conservando el mes.
export function PaymentMethodFilter({ value }: { value: PaymentMethodFilterValue | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next === ALL) params.delete("method");
    else params.set("method", next);
    router.push(`/dashboard/transacciones?${params.toString()}`);
  }

  return (
    <Select value={value ?? ALL} onValueChange={handleChange}>
      <SelectTrigger className="w-44" aria-label="Filtrar por método de pago">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todos los métodos</SelectItem>
        <SelectSeparator />
        {PAYMENT_METHODS.map((method) => (
          <SelectItem key={method} value={method}>
            {PAYMENT_METHOD_LABELS[method]}
          </SelectItem>
        ))}
        <SelectItem value="NONE">{NO_PAYMENT_METHOD_LABEL}</SelectItem>
      </SelectContent>
    </Select>
  );
}
