import { parseDateOnly, shiftDay, todayInLima, toUTCDateInputValue } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export type MarketRate = { rate: number; date: string };

// Serie diaria del BCRP: TC Sistema bancario SBS (S/ por US$) - Venta. Es pública y
// no lleva datos del usuario: solo la serie y el rango de fechas.
const SERIES = "PD04640PD";
const DAYS_BACK = 10;
// Tras un intento fallido no se vuelve a llamar al BCRP hasta pasada esta espera.
const RETRY_AFTER_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 3000;

const MONTHS: Record<string, string> = {
  ene: "01", jan: "01", feb: "02", mar: "03", abr: "04", apr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", aug: "08", set: "09", sep: "09", oct: "10", nov: "11", dic: "12", dec: "12",
};

// "26.Oct.26" → "2026-10-26" (null si el formato es otro).
function parsePeriodName(name: string) {
  const match = /^(\d{1,2})\.([A-Za-zñÑ]{3,})\.(\d{2,4})$/.exec(name.trim());
  if (!match) return null;
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${match[1].padStart(2, "0")}`;
}

// Llama al BCRP y devuelve la última cotización con número, o null si la respuesta no sirve
// (error, timeout, HTML del WAF, sin números).
async function fetchMarketRate(today: Date): Promise<MarketRate | null> {
  try {
    const from = toUTCDateInputValue(shiftDay(today, -DAYS_BACK));
    const to = toUTCDateInputValue(today);
    const response = await fetch(
      `https://estadisticas.bcrp.gob.pe/estadisticas/series/api/${SERIES}/json/${from}/${to}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      }
    );
    if (!response.ok) return null;

    // El BCRP responde con `content-type: text/html` y a veces agrega un aviso en HTML
    // después del JSON: se corta en el primer "<". La página del WAF (Incapsula) es HTML
    // desde el inicio, así que queda vacía y JSON.parse falla (cae en el catch).
    const text = await response.text();
    const cut = text.indexOf("<");
    const data: unknown = JSON.parse(cut === -1 ? text : text.slice(0, cut));
    const periods = (data as { periods?: unknown })?.periods;
    if (!Array.isArray(periods)) return null;

    // Los días sin cotización (fines de semana, feriados) traen "n.d.": se toma el último con número.
    for (let i = periods.length - 1; i >= 0; i--) {
      const period = periods[i] as { name?: unknown; values?: unknown[] };
      const rate = Number(period?.values?.[0]);
      const date = typeof period?.name === "string" ? parsePeriodName(period.name) : null;
      if (date && Number.isFinite(rate) && rate > 0) return { rate, date };
    }
    return null;
  } catch {
    return null;
  }
}

// Última cotización de venta del BCRP, o null si no hay ninguna. Nunca lanza: es solo una
// sugerencia y el dashboard no debe depender del BCRP. La caché es la base de datos: se llama
// al BCRP como mucho una vez al día y solo se guarda una respuesta válida.
export async function getMarketRate(): Promise<MarketRate | null> {
  try {
    const today = todayInLima();
    const stored = await prisma.marketRate.findUnique({ where: { series: SERIES } });
    const saved: MarketRate | null = stored
      ? { rate: Number(stored.rate), date: toUTCDateInputValue(stored.date) }
      : null;

    if (stored && toUTCDateInputValue(stored.checkedOn) === toUTCDateInputValue(today)) return saved;
    if (stored?.lastAttemptAt && Date.now() - stored.lastAttemptAt.getTime() < RETRY_AFTER_MS) return saved;

    const fresh = await fetchMarketRate(today);
    if (fresh) {
      const date = parseDateOnly(fresh.date);
      if (date) {
        await prisma.marketRate.upsert({
          where: { series: SERIES },
          create: { series: SERIES, rate: fresh.rate, date, checkedOn: today, lastAttemptAt: null },
          update: { rate: fresh.rate, date, checkedOn: today, lastAttemptAt: null },
        });
        return fresh;
      }
    }

    // Falla: se marca el intento (si ya hay fila) y se sigue con la última cotización guardada.
    if (stored) {
      await prisma.marketRate.update({ where: { series: SERIES }, data: { lastAttemptAt: new Date() } });
    }
    return saved;
  } catch {
    return null;
  }
}
