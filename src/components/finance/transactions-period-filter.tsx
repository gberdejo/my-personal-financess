"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PeriodRangeFilter, type PeriodSelection } from "@/components/finance/period-range-filter";

// El filtro de periodo del Resumen, guardado en la URL (`?periodo=&desde=&hasta=`)
// para que se combine con los demás filtros y sobreviva a recargar.
export function TransactionsPeriodFilter({ value }: { value: PeriodSelection }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleApply(next: PeriodSelection) {
    const params = new URLSearchParams(searchParams);
    // `month` es el filtro anterior (lo usan algunos enlaces): el periodo lo reemplaza.
    params.delete("month");
    params.set("periodo", next.preset);
    if (next.preset === "custom") {
      params.set("desde", next.customStart);
      params.set("hasta", next.customEnd);
    } else {
      params.delete("desde");
      params.delete("hasta");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return <PeriodRangeFilter value={value} onApply={handleApply} />;
}
