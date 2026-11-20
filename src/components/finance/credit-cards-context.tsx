"use client";

import { createContext, useContext } from "react";
import type { MarketRate } from "@/lib/exchange-rate";

export type CreditCardOption = { id: string; name: string; active: boolean };

const CreditCardsContext = createContext<CreditCardOption[]>([]);
const ExchangeRateContext = createContext<number | null>(null);
const MarketRateContext = createContext<MarketRate | null>(null);

// Las tarjetas de crédito del usuario (del calendario), cargadas en el layout
// del dashboard para que cualquier formulario de gasto pueda elegir una.
export function CreditCardsProvider({
  cards,
  lastExchangeRate,
  marketRate,
  children,
}: {
  cards: CreditCardOption[];
  // Tipo de cambio del último pago de tarjeta en dólares (null si nunca hubo).
  lastExchangeRate: number | null;
  // Cotización de venta del BCRP (null si no se pudo leer): solo una sugerencia.
  marketRate: MarketRate | null;
  children: React.ReactNode;
}) {
  return (
    <CreditCardsContext.Provider value={cards}>
      <ExchangeRateContext.Provider value={lastExchangeRate}>
        <MarketRateContext.Provider value={marketRate}>{children}</MarketRateContext.Provider>
      </ExchangeRateContext.Provider>
    </CreditCardsContext.Provider>
  );
}

export function useLastExchangeRate() {
  return useContext(ExchangeRateContext);
}

export function useMarketRate() {
  return useContext(MarketRateContext);
}

export function useCreditCards() {
  return useContext(CreditCardsContext);
}
