import { shiftDay } from "@/lib/date";
import { clampedDate } from "@/lib/schedule";

// Cronograma de un préstamo con cuota fija (método francés) y periodos de días
// reales, como lo calculan los bancos en Perú. Fechas como medianoche UTC.

const DAY_MS = 24 * 60 * 60 * 1000;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type LoanParams = {
  principal: number;
  // 0.096 = 9.6 %
  tea: number;
  installments: number;
  disbursementDate: Date;
  firstDueDate: Date;
  // Días del año para convertir la TEA a la tasa del periodo (360 o 365).
  dayBasis: number;
  // Seguro de desgravamen: fracción mensual sobre el saldo (0.000285 = 0.0285 %).
  lifeInsuranceRate: number;
  // Otros cargos por mes (seguro del bien, portes), en soles.
  otherCharges: number;
  // Cuota fija que da el banco; si falta, se calcula para cancelar en el plazo.
  fixedInstallment: number | null;
  // Qué hacer si la fecha cae en fin de semana (muchos bancos solo corren los domingos).
  dateShift: LoanDateShift;
};

export type LoanDateShift = "NONE" | "SUNDAY" | "WEEKEND";

export const LOAN_DATE_SHIFTS: LoanDateShift[] = ["SUNDAY", "WEEKEND", "NONE"];

// El pago pasa al lunes si cae en un día no hábil según `shift`.
function shiftDueDate(date: Date, shift: LoanDateShift) {
  const day = date.getUTCDay();
  if (shift === "SUNDAY" && day === 0) return shiftDay(date, 1);
  if (shift === "WEEKEND" && (day === 0 || day === 6)) return shiftDay(date, day === 6 ? 2 : 1);
  return date;
}

export type GeneratedInstallment = {
  number: number;
  dueDate: Date;
  principal: number;
  interest: number;
  lifeInsurance: number;
  otherCharges: number;
  total: number;
  // Saldo de capital después de pagar.
  balance: number;
};

export function loanDueDates(params: Pick<LoanParams, "firstDueDate" | "installments" | "dateShift">) {
  const { firstDueDate, installments, dateShift } = params;
  const day = firstDueDate.getUTCDate();
  return Array.from({ length: installments }, (_, i) =>
    shiftDueDate(clampedDate(firstDueDate.getUTCFullYear(), firstDueDate.getUTCMonth() + i, day), dateShift)
  );
}

function periodDays(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

// Interés, seguros y cargos de un periodo de `days` días sobre `balance`. Los
// seguros y cargos mensuales se prorratean por días (30 = un mes).
function periodCharges(balance: number, days: number, params: LoanParams) {
  return {
    interest: round2(balance * ((1 + params.tea) ** (days / params.dayBasis) - 1)),
    lifeInsurance: round2(balance * params.lifeInsuranceRate * (days / 30)),
    otherCharges: round2(params.otherCharges * (days / 30)),
  };
}

// Cuotas en `dueDates` partiendo de `start` (saldo y fecha desde donde corren
// los intereses, y número de la primera cuota).
function simulateFrom(
  params: LoanParams,
  dueDates: Date[],
  installment: number,
  start: { balance: number; date: Date; number: number }
) {
  const rows: GeneratedInstallment[] = [];
  let balance = start.balance;
  let previous = start.date;

  dueDates.forEach((dueDate, i) => {
    const charges = periodCharges(balance, periodDays(previous, dueDate), params);
    const fees = charges.interest + charges.lifeInsurance + charges.otherCharges;
    const last = i === dueDates.length - 1;
    // La última cuota cancela todo el saldo que quede.
    const principal = last ? balance : round2(installment - fees);
    balance = round2(balance - principal);
    rows.push({
      number: start.number + i,
      dueDate,
      principal: round2(principal),
      ...charges,
      total: round2(principal + fees),
      balance,
    });
    previous = dueDate;
  });

  return rows;
}

function simulate(params: LoanParams, dueDates: Date[], installment: number) {
  return simulateFrom(params, dueDates, installment, {
    balance: params.principal,
    date: params.disbursementDate,
    number: 1,
  });
}

// Rehace las cuotas que siguen a una editada a mano (mismas fechas), con la tasa
// y los seguros del préstamo y partiendo del saldo que dejó esa cuota. Sirve
// cuando el banco tiene una regla propia en un periodo (ej. el primero) y se
// copió esa cuota tal cual.
export function recalculateFollowing(
  params: LoanParams,
  edited: { number: number; dueDate: Date; balance: number },
  dueDates: Date[],
  installment: number
) {
  return simulateFrom(params, dueDates, installment, {
    balance: edited.balance,
    date: edited.dueDate,
    number: edited.number + 1,
  });
}

// Cuota fija (a céntimos) con la que la última cuota queda lo más cerca posible
// de las demás.
function solveInstallment(params: LoanParams, dueDates: Date[]) {
  let low = 0;
  let high = Math.ceil(params.principal * 100);
  // Saldo antes de la última cuota: con la cuota justa, la última ≈ las demás.
  const remaining = (cents: number) => {
    const rows = simulate(params, dueDates, cents / 100);
    const last = rows[rows.length - 1];
    return last.total - cents / 100;
  };
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (remaining(mid) > 0) low = mid + 1;
    else high = mid;
  }
  return low / 100;
}

export function generateLoanSchedule(params: LoanParams) {
  const dueDates = loanDueDates(params);
  if (dueDates.length === 0) return [];
  const installment =
    params.fixedInstallment ?? (dueDates.length === 1 ? params.principal : solveInstallment(params, dueDates));
  return simulate(params, dueDates, installment);
}

export function summarizeLoan(rows: { principal: number; interest: number; lifeInsurance: number; otherCharges: number; total: number }[]) {
  const sum = (pick: (row: (typeof rows)[number]) => number) => round2(rows.reduce((acc, row) => acc + pick(row), 0));
  return {
    principal: sum((r) => r.principal),
    interest: sum((r) => r.interest),
    insurance: sum((r) => r.lifeInsurance + r.otherCharges),
    total: sum((r) => r.total),
  };
}

// Primera cuota en la que el saldo ya quedó negativo (la cuota es más de lo que
// se debe: casi siempre una fecha o una tasa mal escrita). null si cuadra.
export function overpaidInstallment(rows: GeneratedInstallment[]) {
  const row = rows.find((r) => r.balance < 0 || r.total <= 0);
  return row ? row.number : null;
}
