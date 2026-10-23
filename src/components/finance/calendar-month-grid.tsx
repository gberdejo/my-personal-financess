import Link from "next/link";
import { Repeat } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { OccurrenceDialog } from "@/components/finance/occurrence-dialog";
import {
  OccurrenceRow,
  OccurrenceStatusMark,
  occurrenceAmountClass,
  ROULETTE_MARK,
} from "@/components/finance/occurrence-row";
import type { RouletteOperationRow } from "@/features/roulette/queries";
import type { CalendarEntry } from "@/features/schedule/queries";
import { monthRange, shiftDay, todayInLima, toUTCDateInputValue } from "@/lib/date";
import { formatCurrency, formatTransactionDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type AccountOption = { id: string; name: string };

type DayItems = { date: Date; entries: CalendarEntry[]; operations: RouletteOperationRow[] };

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Días a mostrar: semanas completas de lunes a domingo que cubren el mes.
function monthCells(year: number, month: number) {
  const { start, end } = monthRange(year, month);
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  const cells: Date[] = [];
  for (let day = shiftDay(start, -mondayOffset); day < end || cells.length % 7 !== 0; day = shiftDay(day, 1)) {
    cells.push(day);
  }
  return cells;
}

// Cuotas y ruleteos agrupados por día ("YYYY-MM-DD"), en orden de fecha.
function groupByDay(entries: CalendarEntry[], operations: RouletteOperationRow[]) {
  const groups = new Map<string, DayItems>();
  function group(date: Date) {
    const key = toUTCDateInputValue(date);
    const items = groups.get(key) ?? { date, entries: [], operations: [] };
    groups.set(key, items);
    return items;
  }
  for (const entry of entries) group(entry.dueDate).entries.push(entry);
  for (const operation of operations) group(operation.date).operations.push(operation);
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function paymentDetailHref(operation: RouletteOperationRow) {
  return `/dashboard/calendario/pago/${operation.scheduledPaymentId}/${operation.dueDateValue}`;
}

export function CalendarMonthGrid({
  year,
  month,
  entries,
  operations,
  accounts,
}: {
  year: number;
  month: number;
  entries: CalendarEntry[];
  operations: RouletteOperationRow[];
  accounts: AccountOption[];
}) {
  const today = toUTCDateInputValue(todayInLima());
  const byDay = groupByDay(entries, operations);

  return (
    <>
      <Card className="hidden gap-0 overflow-hidden py-0 md:flex">
        <div className="grid grid-cols-7 border-b">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              className="px-2 py-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
            >
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {monthCells(year, month).map((day) => {
            const value = toUTCDateInputValue(day);
            const inMonth = day.getUTCMonth() === month - 1;
            const items = byDay.get(value);
            return (
              <div
                key={value}
                className={cn(
                  "flex min-h-28 flex-col gap-1 border-b border-r p-1.5 nth-[7n]:border-r-0",
                  !inMonth && "bg-muted/30"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                    value === today ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground",
                    !inMonth && "opacity-50"
                  )}
                >
                  {day.getUTCDate()}
                </span>
                {inMonth &&
                  items?.entries.map((entry) => (
                    <OccurrenceDialog key={entry.key} entry={entry} accounts={accounts}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted"
                      >
                        <OccurrenceStatusMark status={entry.status} className="mt-0.5 size-3.5" />
                        <span className="flex min-w-0 flex-col">
                          <span
                            className={cn(
                              "truncate text-xs font-medium",
                              entry.status === "SKIPPED" && "text-muted-foreground line-through"
                            )}
                          >
                            {entry.name}
                          </span>
                          <span className={cn("text-[11px] text-muted-foreground", occurrenceAmountClass(entry.status))}>
                            {formatCurrency(entry.amount)}
                          </span>
                        </span>
                      </button>
                    </OccurrenceDialog>
                  ))}
                {inMonth &&
                  items?.operations.map((operation) => (
                    <Link
                      key={operation.id}
                      href={paymentDetailHref(operation)}
                      className="flex w-full items-start gap-1.5 rounded-md px-1 py-1 transition-colors hover:bg-muted"
                    >
                      <OccurrenceStatusMark status={ROULETTE_MARK[operation.status]} className="mt-0.5 size-3.5" />
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1 truncate text-xs font-medium">
                          <Repeat className="size-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{operation.provider}</span>
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground tabular-nums">
                          {formatCurrency(operation.charge)} ·{" "}
                          <span className="text-expense">{formatCurrency(operation.fee)}</span>
                        </span>
                      </span>
                    </Link>
                  ))}
              </div>
            );
          })}
        </div>
      </Card>

      {/* En móvil la grilla no entra: agenda de los días con pagos y ruleteos. */}
      <Card className="py-0 md:hidden">
        <CardContent className="px-0">
          {byDay.size === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No hay pagos programados en este mes.</p>
          ) : (
            [...byDay.entries()].map(([value, items]) => (
              <div key={value} className="border-t first:border-t-0">
                <p
                  className={cn(
                    "px-4 pt-3 pb-1 text-xs font-medium",
                    value === today ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {value === today ? "Hoy · " : ""}
                  {formatTransactionDate(items.date)}
                </p>
                <ul>
                  {items.entries.map((entry) => (
                    <OccurrenceRow
                      key={entry.key}
                      entry={entry}
                      accounts={accounts}
                      detail={entry.categoryName ?? "Tarjeta de crédito"}
                    />
                  ))}
                  {items.operations.map((operation) => (
                    <li key={operation.id}>
                      <Link
                        href={paymentDetailHref(operation)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
                      >
                        <OccurrenceStatusMark status={ROULETTE_MARK[operation.status]} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                            <Repeat className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">Ruleteo · {operation.provider}</span>
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {operation.cardName} · cargo {formatCurrency(operation.charge)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-expense tabular-nums">
                          {formatCurrency(operation.fee)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
