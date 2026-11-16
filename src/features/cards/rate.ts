import { toSoles } from "@/lib/currency";
import type { Prisma } from "@/generated/prisma/client";

// Al pagar una tarjeta (o cambiar el tipo de cambio del pago), los consumos en
// dólares de su ciclo quedan con ese tipo de cambio y su monto en soles exacto.
export async function applyCycleRate(
  tx: Prisma.TransactionClient,
  cardId: string,
  cycle: { start: Date; end: Date },
  rate: number
) {
  const charges = await tx.transaction.findMany({
    where: {
      cardId,
      kind: "EXPENSE",
      accountId: null,
      currency: "USD",
      date: { gte: cycle.start, lt: cycle.end },
    },
    select: { id: true, foreignAmount: true },
  });
  for (const charge of charges) {
    if (charge.foreignAmount == null) continue;
    await tx.transaction.update({
      where: { id: charge.id },
      data: { exchangeRate: rate, amount: toSoles(Number(charge.foreignAmount), rate) },
    });
  }
}
