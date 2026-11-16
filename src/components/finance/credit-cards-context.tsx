"use client";

import { createContext, useContext } from "react";

export type CreditCardOption = { id: string; name: string; active: boolean };

const CreditCardsContext = createContext<CreditCardOption[]>([]);
const ExchangeRateContext = createContext<number | null>(null);

// Las tarjetas de crédito del usuario (del calendario), cargadas en el layout
// del dashboard para que cualquier formulario de gasto pueda elegir una.
export function CreditCardsProvider({
  cards,
  lastExchangeRate,
  children,
}: {
  cards: CreditCardOption[];
  // Tipo de cambio del último pago de tarjeta en dólares (null si nunca hubo).
  lastExchangeRate: number | null;
  children: React.ReactNode;
}) {
  return (
    <CreditCardsContext.Provider value={cards}>
      <ExchangeRateContext.Provider value={lastExchangeRate}>{children}</ExchangeRateContext.Provider>
    </CreditCardsContext.Provider>
  );
}

export function useLastExchangeRate() {
  return useContext(ExchangeRateContext);
}

export function useCreditCards() {
  return useContext(CreditCardsContext);
}
