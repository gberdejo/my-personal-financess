"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountFilter } from "@/components/finance/account-filter";
import { MovementKindFilter } from "@/components/finance/movement-kind-filter";
import { PaymentMethodFilter } from "@/components/finance/payment-method-filter";
import { PeriodRangeFilter, type PeriodSelection } from "@/components/finance/period-range-filter";
import type { CardFilter, PaymentMethodFilter as PaymentMethodFilterValue } from "@/features/transactions/queries";
import { KIND_PARAM, type MovementKind } from "@/lib/labels";

type MethodSelection = { method: PaymentMethodFilterValue | null; card: CardFilter | null };

// Barra de consulta de Transacciones: primero el tipo (lo que más cambia lo que se ve) y
// después periodo, cuenta y método. Se eligen sin consultar y se aplican juntos con
// "Buscar", que los guarda en la URL (`?tipo=&periodo=&desde=&hasta=&account=&method=&tarjeta=`).
export function TransactionsFilters({
  accounts,
  kind,
  period,
  account,
  method,
  card,
}: {
  accounts: { id: string; name: string }[];
  kind: MovementKind | null;
  period: PeriodSelection;
  account: string | null;
  method: PaymentMethodFilterValue | null;
  card: CardFilter | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draftKind, setDraftKind] = useState<MovementKind | null>(kind);
  const [draftPeriod, setDraftPeriod] = useState<PeriodSelection>(period);
  const [draftAccount, setDraftAccount] = useState<string | null>(account);
  const [draftMethod, setDraftMethod] = useState<MethodSelection>({ method, card });
  const [isPending, startTransition] = useTransition();

  const hasChanges =
    draftKind !== kind ||
    draftPeriod.preset !== period.preset ||
    draftPeriod.customStart !== period.customStart ||
    draftPeriod.customEnd !== period.customEnd ||
    draftAccount !== account ||
    draftMethod.method !== method ||
    draftMethod.card !== card;

  // El método de pago solo existe en gastos: elegir uno pasa el tipo a Gastos,
  // y elegir Ingresos lo quita.
  function changeKind(next: MovementKind | null) {
    setDraftKind(next);
    if (next === "INCOME") setDraftMethod({ method: null, card: null });
  }

  function changeMethod(next: MethodSelection) {
    setDraftMethod(next);
    if (next.method) setDraftKind("EXPENSE");
  }

  function handleSearch() {
    const params = new URLSearchParams(searchParams);
    // `month` es el filtro anterior (lo usan algunos enlaces): el periodo lo reemplaza.
    params.delete("month");
    if (draftKind) params.set("tipo", KIND_PARAM[draftKind]);
    else params.delete("tipo");
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
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-2 sm:flex-row sm:items-center">
        <MovementKindFilter value={draftKind} onChange={changeKind} className="w-full" />
        <div aria-hidden className="hidden h-6 w-px shrink-0 bg-border sm:block" />
        <div className="-mx-2 flex min-w-0 gap-2 overflow-x-auto px-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0">
          <PeriodRangeFilter value={draftPeriod} onApply={setDraftPeriod} applyLabel="Listo" />
          <AccountFilter accounts={accounts} value={draftAccount} onChange={setDraftAccount} />
          <PaymentMethodFilter
            value={draftMethod.method}
            card={draftMethod.card}
            onChange={changeMethod}
            disabled={draftKind === "INCOME"}
          />
        </div>
        <Button onClick={handleSearch} disabled={isPending || !hasChanges} className="w-full sm:ml-auto sm:w-auto">
          <Search className="size-4" data-icon="inline-start" />
          {isPending ? "Buscando…" : "Buscar"}
        </Button>
      </div>
      {hasChanges && !isPending && (
        <p className="px-1 text-xs text-muted-foreground">Presiona Buscar para actualizar la lista.</p>
      )}
    </div>
  );
}
