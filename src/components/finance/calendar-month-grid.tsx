import { Card, CardContent } from "@/components/ui/card";
import { OccurrenceDialog } from "@/components/finance/occurrence-dialog";
import { OccurrenceRow, OccurrenceStatusMark, occurrenceAmountClass } from "@/components/finance/occurrence-row";
import type { CalendarEntry } from "@/features/schedule/queries";
import { monthRange, shiftDay, todayInLima, toUTCDateInputValue } from "@/lib/date";
import { formatCurrency, formatTransactionDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type AccountOption = { id: string; name: string };

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

function groupByDay(entries: CalendarEntry[]) {
  const groups = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.dueDateValue) ?? [];
    group.push(entry);
    groups.set(entry.dueDateValue, group);
  }
  return groups;
}

export function CalendarMonthGrid({
  year,
  month,
  entries,
  accounts,
}: {
  year: number;
  month: number;
  entries: CalendarEntry[];
  accounts: AccountOption[];
}) {
  const today = toUTCDateInputValue(todayInLima());
  const byDay = groupByDay(entries);

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
            const dayEntries = byDay.get(value) ?? [];
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
                  dayEntries.map((entry) => (
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
              </div>
            );
          })}
        </div>
      </Card>

      {/* En móvil la grilla no entra: agenda de los días con pagos. */}
      <Card className="py-0 md:hidden">
        <CardContent className="px-0">
          {entries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No hay pagos programados en este mes.</p>
          ) : (
            [...byDay.entries()].map(([value, dayEntries]) => (
              <div key={value} className="border-t first:border-t-0">
                <p
                  className={cn(
                    "px-4 pt-3 pb-1 text-xs font-medium",
                    value === today ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {value === today ? "Hoy · " : ""}
                  {formatTransactionDate(dayEntries[0].dueDate)}
                </p>
                <ul>
                  {dayEntries.map((entry) => (
                    <OccurrenceRow
                      key={entry.key}
                      entry={entry}
                      accounts={accounts}
                      detail={entry.categoryName ?? "Tarjeta de crédito"}
                    />
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
