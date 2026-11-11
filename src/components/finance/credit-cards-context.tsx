"use client";

import { createContext, useContext } from "react";

export type CreditCardOption = { id: string; name: string; active: boolean };

const CreditCardsContext = createContext<CreditCardOption[]>([]);

// Las tarjetas de crédito del usuario (del calendario), cargadas en el layout
// del dashboard para que cualquier formulario de gasto pueda elegir una.
export function CreditCardsProvider({
  cards,
  children,
}: {
  cards: CreditCardOption[];
  children: React.ReactNode;
}) {
  return <CreditCardsContext.Provider value={cards}>{children}</CreditCardsContext.Provider>;
}

export function useCreditCards() {
  return useContext(CreditCardsContext);
}
