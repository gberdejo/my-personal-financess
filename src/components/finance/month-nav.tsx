"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthKey, monthLabel, shiftMonth } from "@/lib/date";

export function MonthNav({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function goTo(targetYear: number, targetMonth: number) {
    const params = new URLSearchParams(searchParams);
    params.set("month", monthKey(targetYear, targetMonth));
    router.push(`/dashboard/transacciones?${params.toString()}`);
  }

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => goTo(prev.year, prev.month)}>
        <ChevronLeft className="size-4" />
        <span className="sr-only">Mes anterior</span>
      </Button>
      <span className="min-w-32 text-center text-sm font-medium sm:min-w-36">{monthLabel(year, month)}</span>
      <Button variant="outline" size="icon" onClick={() => goTo(next.year, next.month)}>
        <ChevronRight className="size-4" />
        <span className="sr-only">Mes siguiente</span>
      </Button>
    </div>
  );
}
