import { prisma } from "@/lib/prisma";
import { billingCycle, billingIndexOf, billingMonthKey, periodsByMonth, type BillingPeriod } from "@/lib/schedule";

// Estado de un consumo con tarjeta: no se guarda. Está pagado si el vencimiento
// del ciclo en que cayó (ScheduledOccurrence) está marcado como pagado.
export type ChargeStatus = {
  status: "PENDING" | "PAID";
  dueDate: Date;
  // "YYYY-MM" del ciclo, para `/dashboard/tarjetas/[id]?ciclo=`.
  cycleKey: string;
};

export async function chargeStatuses(
  charges: { id: string; date: Date; cardId: string | null }[]
): Promise<Map<string, ChargeStatus>> {
  const result = new Map<string, ChargeStatus>();
  const cardIds = [...new Set(charges.flatMap((c) => (c.cardId ? [c.cardId] : [])))];
  if (cardIds.length === 0) return result;

  const [cards, periods] = await Promise.all([
    prisma.scheduledPayment.findMany({
      where: { id: { in: cardIds }, type: "CREDIT_CARD" },
      select: { id: true, startDate: true, closingDay: true, dueDay: true },
    }),
    prisma.cardBillingPeriod.findMany({
      where: { scheduledPaymentId: { in: cardIds } },
      select: { scheduledPaymentId: true, closingDate: true, dueDate: true },
    }),
  ]);

  const periodsOf = new Map<string, BillingPeriod[]>();
  for (const period of periods) {
    const list = periodsOf.get(period.scheduledPaymentId) ?? [];
    list.push(period);
    periodsOf.set(period.scheduledPaymentId, list);
  }
  const contexts = new Map(
    cards.flatMap((card) =>
      card.closingDay && card.dueDay
        ? [
            [
              card.id,
              {
                rule: { startDate: card.startDate, closingDay: card.closingDay, dueDay: card.dueDay },
                byMonth: periodsByMonth(periodsOf.get(card.id) ?? []),
              },
            ] as const,
          ]
        : []
    )
  );

  const cycles = new Map<string, { cardId: string; dueDate: Date; cycleKey: string }>();
  for (const charge of charges) {
    const context = charge.cardId ? contexts.get(charge.cardId) : undefined;
    if (!charge.cardId || !context) continue;
    const cycle = billingCycle(context.rule, context.byMonth, billingIndexOf(context.rule, context.byMonth, charge.date));
    cycles.set(charge.id, { cardId: charge.cardId, dueDate: cycle.dueDate, cycleKey: billingMonthKey(cycle.index) });
  }

  const dueDates = [...new Set([...cycles.values()].map((c) => c.dueDate.getTime()))].map((t) => new Date(t));
  const paid = dueDates.length
    ? await prisma.scheduledOccurrence.findMany({
        where: { scheduledPaymentId: { in: cardIds }, dueDate: { in: dueDates }, status: "PAID" },
        select: { scheduledPaymentId: true, dueDate: true },
      })
    : [];
  const paidKeys = new Set(paid.map((o) => `${o.scheduledPaymentId}:${o.dueDate.getTime()}`));

  for (const [chargeId, cycle] of cycles) {
    result.set(chargeId, {
      status: paidKeys.has(`${cycle.cardId}:${cycle.dueDate.getTime()}`) ? "PAID" : "PENDING",
      dueDate: cycle.dueDate,
      cycleKey: cycle.cycleKey,
    });
  }
  return result;
}
