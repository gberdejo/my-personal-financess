import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseDateOnly, shiftDay, todayInLima } from "@/lib/date";
import {
  billingCycle,
  billingIndexOf,
  billingMonthKey,
  monthIndex,
  periodsByMonth,
  type BillingCycle,
  type BillingPeriod,
  type CardRule,
} from "@/lib/schedule";
import { amountLockInfo } from "@/lib/transaction-lock";
import { getPaymentEntries, type CalendarEntry } from "@/features/schedule/queries";
import { loadUserCards } from "./lookup";
import type { PaymentMethod } from "@/generated/prisma/client";

// Una tarjeta es un ScheduledPayment de tipo CREDIT_CARD. Sus ciclos salen del
// cronograma (CardBillingPeriod) y, para los meses sin fila, de la regla
// closingDay/dueDay. Sus consumos son los gastos sin cuenta con su `cardId`:
// no salen de ninguna cuenta hasta que se paga el periodo (un CARD_PAYMENT).

// Ciclos que se muestran en "Periodos" (el actual y los anteriores).
const HISTORY_CYCLES = 6;

// Tarjetas de crédito del usuario, para elegir con cuál se pagó un gasto.
export async function getCreditCardOptions() {
  const userId = await requireUserId();
  return loadUserCards(userId);
}

type CardRow = { id: string; startDate: Date; closingDay: number | null; dueDay: number | null };

function ruleOf(card: CardRow): CardRule | null {
  return card.closingDay && card.dueDay
    ? { startDate: card.startDate, closingDay: card.closingDay, dueDay: card.dueDay }
    : null;
}

async function loadAllPeriods(cardIds: string[]) {
  const periods = await prisma.cardBillingPeriod.findMany({
    where: { scheduledPaymentId: { in: cardIds } },
    select: { scheduledPaymentId: true, closingDate: true, dueDate: true },
  });
  return (cardId: string) => periodsByMonth(periods.filter((p) => p.scheduledPaymentId === cardId));
}

function parseCycleKey(raw: string | undefined) {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null;
  const [year, month] = raw.split("-").map(Number);
  if (month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

// Ciclo cuyo pago vence en `dueDate` ("YYYY-MM-DD"): el pago cae a lo sumo dos
// meses después del cierre.
function cycleIndexForDue(rule: CardRule, byMonth: Map<number, BillingPeriod>, raw: string | undefined) {
  const dueDate = raw ? parseDateOnly(raw) : null;
  if (!dueDate) return null;
  for (let index = monthIndex(dueDate); index >= monthIndex(dueDate) - 2; index--) {
    if (billingCycle(rule, byMonth, index).dueDate.getTime() === dueDate.getTime()) return index;
  }
  return null;
}

function sumInCycle(transactions: { date: Date; amount: unknown }[], cycle: BillingCycle) {
  return transactions
    .filter((t) => t.date >= cycle.start && t.date < cycle.end)
    .reduce((sum, t) => sum + Number(t.amount), 0);
}

// Vencimiento del calendario que corresponde a un ciclo (null si es anterior a la tarjeta).
function entryOf(entries: CalendarEntry[], cycle: BillingCycle) {
  return entries.find((e) => e.dueDate.getTime() === cycle.dueDate.getTime()) ?? null;
}

// Consumos de tarjetas: gastos sin cuenta (los que tienen cuenta ya se descontaron).
function chargesWhere(userId: string, cardIds: string[]) {
  return { userId, kind: "EXPENSE" as const, accountId: null, cardId: { in: cardIds } };
}

export type CardSummary = {
  id: string;
  name: string;
  active: boolean;
  current: { start: Date; closing: Date; dueDate: Date; spent: number } | null;
  // Lo próximo por pagar: vencido o pendiente (o el siguiente si todo está pagado).
  next: { dueDate: Date; dueDateValue: string; amount: number; status: CalendarEntry["status"] } | null;
};

export async function getCards(): Promise<CardSummary[]> {
  const userId = await requireUserId();
  const today = todayInLima();

  const cards = await prisma.scheduledPayment.findMany({
    where: { userId, type: "CREDIT_CARD" },
    select: { id: true, name: true, active: true, startDate: true, closingDay: true, dueDay: true },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
  if (cards.length === 0) return [];

  const periodsOf = await loadAllPeriods(cards.map((c) => c.id));
  const cycles = new Map<string, BillingCycle>();
  for (const card of cards) {
    const rule = ruleOf(card);
    if (!rule) continue;
    const byMonth = periodsOf(card.id);
    cycles.set(card.id, billingCycle(rule, byMonth, billingIndexOf(rule, byMonth, today)));
  }

  const charges = cycles.size
    ? await prisma.transaction.findMany({
        where: {
          ...chargesWhere(userId, cards.map((c) => c.id)),
          date: { gte: new Date(Math.min(...[...cycles.values()].map((c) => c.start.getTime()))) },
        },
        select: { cardId: true, date: true, amount: true },
      })
    : [];

  return Promise.all(
    cards.map(async (card): Promise<CardSummary> => {
      const cycle = cycles.get(card.id) ?? null;
      const entries = card.active
        ? await getPaymentEntries(card.id, shiftDay(today, -90), shiftDay(today, 75))
        : [];
      const next =
        entries.find((e) => e.status === "OVERDUE" || e.status === "PENDING") ??
        entries.find((e) => e.dueDate >= today) ??
        null;
      return {
        id: card.id,
        name: card.name,
        active: card.active,
        current: cycle
          ? {
              start: cycle.start,
              closing: cycle.closing,
              dueDate: cycle.dueDate,
              spent: sumInCycle(
                charges.filter((t) => t.cardId === card.id),
                cycle
              ),
            }
          : null,
        next: next
          ? { dueDate: next.dueDate, dueDateValue: next.dueDateValue, amount: next.amount, status: next.status }
          : null,
      };
    })
  );
}

export type CardCharge = {
  id: string;
  date: Date;
  createdAt: Date;
  kind: "EXPENSE";
  amount: number;
  reason: string | null;
  description: string | null;
  categoryId: string;
  categoryName: string;
  paymentMethod: PaymentMethod | null;
  cardId: string | null;
  receiptUrls: string[];
  amountLock: ReturnType<typeof amountLockInfo>;
};

export type LinkCandidate = {
  id: string;
  date: Date;
  amount: number;
  label: string;
  categoryName: string;
  paymentMethod: PaymentMethod | null;
  // De dónde sale hoy: la cuenta (ya descontado) o la otra tarjeta.
  accountName: string | null;
  cardName: string | null;
  // Gasto con tarjeta de crédito que todavía resta de una cuenta (anterior a los consumos).
  legacyCard: boolean;
};

export async function getCardDetail(
  cardId: string,
  params: { cycle?: string; payment?: string }
) {
  const userId = await requireUserId();
  const today = todayInLima();

  const card = await prisma.scheduledPayment.findFirst({
    where: { id: cardId, userId, type: "CREDIT_CARD" },
    select: { id: true, name: true, active: true, startDate: true, closingDay: true, dueDay: true },
  });
  const rule = card ? ruleOf(card) : null;
  if (!card || !rule) return null;

  const byMonth = (await loadAllPeriods([card.id]))(card.id);
  const currentIndex = billingIndexOf(rule, byMonth, today);
  const selectedIndex =
    cycleIndexForDue(rule, byMonth, params.payment) ?? parseCycleKey(params.cycle) ?? currentIndex;
  const cycle = billingCycle(rule, byMonth, selectedIndex);
  const current = billingCycle(rule, byMonth, currentIndex);
  const history = Array.from({ length: HISTORY_CYCLES }, (_, i) =>
    billingCycle(rule, byMonth, currentIndex - HISTORY_CYCLES + 1 + i)
  ).reverse();

  const allCycles = [cycle, ...history];
  const from = new Date(Math.min(...allCycles.map((c) => c.start.getTime())));
  const to = new Date(Math.max(...allCycles.map((c) => c.end.getTime())));
  const dueFrom = new Date(Math.min(...allCycles.map((c) => c.dueDate.getTime())));
  const dueTo = shiftDay(new Date(Math.max(...allCycles.map((c) => c.dueDate.getTime()))), 1);

  const [spending, charges, candidates, entries, occurrence, chargeCount] = await Promise.all([
    prisma.transaction.findMany({
      where: { ...chargesWhere(userId, [card.id]), date: { gte: from, lt: to } },
      select: { date: true, amount: true },
    }),
    prisma.transaction.findMany({
      where: { ...chargesWhere(userId, [card.id]), date: { gte: cycle.start, lt: cycle.end } },
      include: {
        category: { select: { name: true } },
        loanPrepayment: { select: { scheduledPaymentId: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    // Cualquier gasto del ciclo que no sea ya un consumo de esta tarjeta.
    prisma.transaction.findMany({
      where: {
        userId,
        kind: "EXPENSE",
        date: { gte: cycle.start, lt: cycle.end },
        NOT: { accountId: null, cardId: card.id },
      },
      include: {
        category: { select: { name: true } },
        account: { select: { name: true } },
        card: { select: { name: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    getPaymentEntries(card.id, dueFrom, dueTo),
    // El pago del periodo (si se registró como transacción).
    prisma.scheduledOccurrence.findUnique({
      where: { scheduledPaymentId_dueDate: { scheduledPaymentId: card.id, dueDate: cycle.dueDate } },
      select: {
        transaction: { select: { id: true, date: true, amount: true, account: { select: { name: true } } } },
      },
    }),
    prisma.transaction.count({ where: chargesWhere(userId, [card.id]) }),
  ]);

  // Primero los gastos con tarjeta que todavía restan de una cuenta: son los que
  // más probablemente falta pasar a consumo.
  const isLegacy = (t: { paymentMethod: PaymentMethod | null; accountId: string | null }) =>
    t.paymentMethod === "CREDIT_CARD" && t.accountId !== null;
  const sortedCandidates = [...candidates].sort((a, b) => Number(isLegacy(b)) - Number(isLegacy(a)));
  const payment = occurrence?.transaction ?? null;

  return {
    card: {
      id: card.id,
      name: card.name,
      active: card.active,
      // Fechas del próximo estado de cuenta, para el formulario de edición.
      nextClosing: current.closing,
      nextDue: current.dueDate,
      // Con consumos no se puede borrar: quedarían sin cuenta ni tarjeta.
      hasCharges: chargeCount > 0,
    },
    cycle: {
      ...cycle,
      key: billingMonthKey(cycle.index),
      prevKey: billingMonthKey(cycle.index - 1),
      nextKey: billingMonthKey(cycle.index + 1),
      isCurrent: cycle.index === currentIndex,
      // Todavía no empezó (se navegó hacia adelante).
      isFuture: cycle.index > currentIndex,
      spent: sumInCycle(spending, cycle),
      entry: entryOf(entries, cycle),
      payment: payment
        ? {
            transactionId: payment.id,
            date: payment.date,
            amount: Number(payment.amount),
            accountName: payment.account?.name ?? null,
          }
        : null,
    },
    history: history.map((c) => ({
      key: billingMonthKey(c.index),
      start: c.start,
      closing: c.closing,
      dueDate: c.dueDate,
      spent: sumInCycle(spending, c),
      status: entryOf(entries, c)?.status ?? null,
      selected: c.index === cycle.index,
    })),
    charges: charges.map(
      (t): CardCharge => ({
        id: t.id,
        date: t.date,
        createdAt: t.createdAt,
        kind: "EXPENSE",
        amount: Number(t.amount),
        reason: t.reason,
        description: t.description,
        categoryId: t.categoryId,
        categoryName: t.category.name,
        paymentMethod: t.paymentMethod,
        cardId: t.cardId,
        receiptUrls: t.receiptUrls,
        amountLock: amountLockInfo(t),
      })
    ),
    legacyCount: candidates.filter((t) => isLegacy(t) && (t.cardId === null || t.cardId === card.id)).length,
    candidates: sortedCandidates.map(
      (t): LinkCandidate => ({
        id: t.id,
        date: t.date,
        amount: Number(t.amount),
        label: t.reason ?? t.description ?? t.category.name,
        categoryName: t.category.name,
        paymentMethod: t.paymentMethod,
        accountName: t.account?.name ?? null,
        cardName: t.card?.name ?? null,
        legacyCard: isLegacy(t),
      })
    ),
  };
}

export type CardDetail = NonNullable<Awaited<ReturnType<typeof getCardDetail>>>;
