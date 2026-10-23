import { shiftDay } from "@/lib/date";

// Ruleteo con comisión descontada: se cargan `charge` a la tarjeta y el
// proveedor deposita charge − charge × rate. Montos en soles con céntimos.

const DAY_MS = 24 * 60 * 60 * 1000;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function rouletteFee(charge: number, rate: number) {
  return round2(charge * rate);
}

export function rouletteReceived(charge: number, rate: number) {
  return round2(charge - rouletteFee(charge, rate));
}

// Cargo mínimo para que lleguen `net`. Se sube de a céntimo por si el
// redondeo deja lo recibido un céntimo corto.
export function chargeForNet(net: number, rate: number) {
  let charge = round2(net / (1 - rate));
  while (rouletteReceived(charge, rate) < net) charge = round2(charge + 0.01);
  return charge;
}

// Operaciones aproximadas que harían falta, para frenar planes absurdos antes de armarlos.
export function estimateOperationCount(net: number, rate: number, maxCharge: number) {
  return Math.ceil(net / (1 - rate) / maxCharge);
}

// Reparte lo que hay que recibir (`net`) en operaciones de hasta `maxCharge`
// con cargos parejos, y sus fechas uniformemente entre `start` y `end`
// (inclusive; si hay más operaciones que días, varias caen el mismo día).
export function planRoulette({
  net,
  rate,
  maxCharge,
  start,
  end,
}: {
  net: number;
  rate: number;
  maxCharge: number;
  start: Date;
  end: Date;
}) {
  const total = chargeForNet(net, rate);
  const count = Math.ceil(total / maxCharge);
  const even = Math.floor((total / count) * 100) / 100;

  const charges: number[] = [];
  let remaining = net;
  for (let i = 0; i < count - 1; i++) {
    charges.push(even);
    remaining = round2(remaining - rouletteReceived(even, rate));
  }
  // La última cubre lo que falte; si por redondeo no entra en el máximo, se agrega otra.
  while (remaining > 0) {
    const charge = Math.min(chargeForNet(remaining, rate), maxCharge);
    charges.push(charge);
    remaining = round2(remaining - rouletteReceived(charge, rate));
  }

  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
  return charges.map((charge, index) => ({
    date: shiftDay(start, Math.floor((index * days) / charges.length)),
    charge,
  }));
}

export function summarizeRoulette(operations: { charge: number; fee: number }[]) {
  const charged = round2(operations.reduce((sum, op) => sum + op.charge, 0));
  const fees = round2(operations.reduce((sum, op) => sum + op.fee, 0));
  return { charged, fees, received: round2(charged - fees) };
}
