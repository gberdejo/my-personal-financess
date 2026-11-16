import { prisma } from "@/lib/prisma";
import { normalizeHeader } from "@/lib/imports/text";
import type { PaymentMethod } from "@/generated/prisma/client";

// Las tarjetas de crédito son los pagos del calendario de tipo CREDIT_CARD. Un
// gasto con método "Tarjeta de crédito" guarda en `cardId` con cuál se pagó, y
// solo suma en el estimado de esa tarjeta.

export type CardRef = { id: string; name: string; active: boolean };

export async function loadUserCards(userId: string): Promise<CardRef[]> {
  return prisma.scheduledPayment.findMany({
    where: { userId, type: "CREDIT_CARD" },
    select: { id: true, name: true, active: true },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
}

// La única tarjeta activa, para asignarla sola cuando no se elige ninguna.
export function soleActiveCard(cards: CardRef[]) {
  const active = cards.filter((c) => c.active);
  return active.length === 1 ? active[0] : null;
}

// Tarjeta por nombre (sin importar mayúsculas ni tildes), como la escribe la plantilla.
export function findCardByName(cards: CardRef[], name: string) {
  const key = normalizeHeader(name);
  return cards.find((c) => normalizeHeader(c.name) === key) ?? null;
}

// Tarjeta de un consumo (gasto con tarjeta de crédito), leída de `cardId`:
// - si viene, tiene que ser una tarjeta del usuario;
// - si no viene y hay una sola tarjeta activa, es esa;
// - si hay varias, hay que elegir; si no hay ninguna, hay que registrarla.
export async function readChargeCard(
  userId: string,
  formData: FormData
): Promise<{ cardId: string } | { error: string }> {
  const raw = String(formData.get("cardId") ?? "").trim();
  const cards = await loadUserCards(userId);
  if (raw) return cards.some((c) => c.id === raw) ? { cardId: raw } : { error: "Tarjeta inválida." };

  const sole = soleActiveCard(cards);
  if (sole) return { cardId: sole.id };
  if (!cards.some((c) => c.active)) {
    return { error: "Registrá tu tarjeta en Tarjetas para registrar consumos con tarjeta de crédito." };
  }
  return { error: "Elegí con qué tarjeta pagaste." };
}

// De dónde sale un gasto nuevo. Con tarjeta de crédito es un consumo: no sale
// de ninguna cuenta (se paga al pagar la tarjeta) y la tarjeta es obligatoria.
// Con cualquier otro método sale de la cuenta del formulario.
export async function readExpenseSource(
  userId: string,
  paymentMethod: PaymentMethod | null,
  formData: FormData
): Promise<{ accountId: string | null; cardId: string | null } | { error: string }> {
  if (paymentMethod === "CREDIT_CARD") {
    const card = await readChargeCard(userId, formData);
    return "error" in card ? card : { accountId: null, cardId: card.cardId };
  }
  const accountId = String(formData.get("accountId") ?? "").trim();
  const account = accountId
    ? await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } })
    : null;
  return account ? { accountId: account.id, cardId: null } : { error: "Elegí una cuenta." };
}

const CARD_PAYMENT_CATEGORY = "Pago de tarjeta";

// Categoría predefinida de los pagos de tarjeta (CARD_PAYMENT). Se crea al
// primer uso: con userId null el @@unique no sirve para un upsert.
export async function cardPaymentCategoryId() {
  const where = { userId: null, name: CARD_PAYMENT_CATEGORY, kind: "CARD_PAYMENT" as const };
  const existing = await prisma.category.findFirst({ where, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.category.create({ data: where, select: { id: true } });
  return created.id;
}

// Último tipo de cambio con el que se pagó una tarjeta en dólares: sirve para
// estimar en soles los consumos en dólares que todavía no se pagan.
export async function latestExchangeRate(userId: string) {
  const [payment, marked] = await Promise.all([
    prisma.transaction.findFirst({
      where: { userId, kind: "CARD_PAYMENT", currency: "USD", exchangeRate: { not: null } },
      select: { exchangeRate: true, createdAt: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    // Los vencimientos marcados con "solo marcar" guardan su TC sin crear pagos.
    prisma.scheduledOccurrence.findFirst({
      where: { exchangeRate: { not: null }, scheduledPayment: { userId, type: "CREDIT_CARD" } },
      select: { exchangeRate: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const latest = [payment, marked]
    .filter((item) => item?.exchangeRate != null)
    .sort((a, b) => b!.createdAt.getTime() - a!.createdAt.getTime())[0];
  return latest?.exchangeRate != null ? Number(latest.exchangeRate) : null;
}
