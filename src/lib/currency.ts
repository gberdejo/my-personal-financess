import { roundMoney } from "@/lib/format";

// Solo las tarjetas de crédito tienen consumos y pagos en dólares. `amount` de
// una transacción siempre está en soles; el dólar original va en `foreignAmount`.

// Soles que equivalen a un monto en dólares con un tipo de cambio.
export function toSoles(usd: number, rate: number) {
  return roundMoney(usd * rate);
}

// Tipo de cambio de un campo del formulario: mayor a 0, redondeado a 4 decimales.
// Vacío = null (quien lo llama decide si es obligatorio).
export function readExchangeRate(
  formData: FormData,
  field = "exchangeRate"
): { rate: number | null } | { error: string } {
  const raw = String(formData.get(field) ?? "").trim();
  if (!raw) return { rate: null };
  const value = Number(raw);
  const rate = Math.round(value * 10000) / 10000;
  if (!Number.isFinite(value) || rate <= 0) return { error: "El tipo de cambio debe ser mayor a 0." };
  return { rate };
}
