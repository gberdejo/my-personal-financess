"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountFilter } from "@/components/finance/account-filter";
import { PaymentMethodFilter } from "@/components/finance/payment-method-filter";
import { PeriodRangeFilter, type PeriodSelection } from "@/components/finance/period-range-filter";
import type { CardFilter, PaymentMethodFilter as PaymentMethodFilterValue } from "@/features/transactions/queries";

type MethodSelection = { method: PaymentMethodFilterValue | null; card: CardFilter | null };

// Filtros de Transacciones (periodo, cuenta y método). Se eligen sin consultar y
// se aplican juntos con "Buscar", que los guarda en la URL
// (`?periodo=&desde=&hasta=&account=&method=&tarjeta=`) para que sobrevivan a recargar.
export function TransactionsFilters({
  accounts,
  period,
  account,
  method,
  card,
}: {
  accounts: { id: string; name: string }[];
  period: PeriodSelection;
  account: string | null;
  method: PaymentMethodFilterValue | null;
  card: CardFilter | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draftPeriod, setDraftPeriod] = useState<PeriodSelection>(period);
  const [draftAccount, setDraftAccount] = useState<string | null>(account);
  const [draftMethod, setDraftMethod] = useState<MethodSelection>({ method, card });
  const [isPending, startTransition] = useTransition();

  const hasChanges =
    draftPeriod.preset !== period.preset ||
    draftPeriod.customStart !== period.customStart ||
    draftPeriod.customEnd !== period.customEnd ||
    draftAccount !== account ||
    draftMethod.method !== method ||
    draftMethod.card !== card;

  function handleSearch() {
    const params = new URLSearchParams(searchParams);
    // `month` es el filtro anterior (lo usan algunos enlaces): el periodo lo reemplaza.
    params.delete("month");
    params.set("periodo", draftPeriod.preset);
    if (draftPeriod.preset === "custom") {
      params.set("desde", draftPeriod.customStart);
      params.set("hasta", draftPeriod.customEnd);
    } else {
      params.delete("desde");
      params.delete("hasta");
    }
    if (draftAccount) params.set("account", draftAccount);
    else params.delete("account");
    if (draftMethod.method) params.set("method", draftMethod.method);
    else params.delete("method");
    if (draftMethod.card) params.set("tarjeta", draftMethod.card);
    else params.delete("tarjeta");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="flex flex-col gap-1.5 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodRangeFilter value={draftPeriod} onApply={setDraftPeriod} applyLabel="Listo" />
        <AccountFilter accounts={accounts} value={draftAccount} onChange={setDraftAccount} />
        <PaymentMethodFilter value={draftMethod.method} card={draftMethod.card} onChange={setDraftMethod} />
        <Button onClick={handleSearch} disabled={isPending || !hasChanges}>
          <Search className="size-4" data-icon="inline-start" />
          {isPending ? "Buscando…" : "Buscar"}
        </Button>
      </div>
      {hasChanges && !isPending && (
        <p className="text-xs text-muted-foreground">Presiona Buscar para actualizar la lista.</p>
      )}
    </div>
  );
}
