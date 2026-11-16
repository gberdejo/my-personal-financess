import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardFormDialog } from "@/components/finance/card-form-dialog";
import { OccurrenceStatusMark, occurrenceAmountClass } from "@/components/finance/occurrence-row";
import { getCards } from "@/features/cards/queries";
import { daysUntil } from "@/lib/date";
import { formatCountdown, formatDayMonth, formatEntryAmount, formatMixed, formatTransactionDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABELS = { PENDING: "Pendiente", OVERDUE: "Vencido", PARTIAL: "Pagado en parte", PAID: "Pagado", SKIPPED: "Omitido" } as const;

export default async function TarjetasPage() {
  const cards = await getCards();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-medium italic md:text-3xl">Tarjetas</h1>
        <CardFormDialog />
      </div>

      {cards.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sin tarjetas todavía</CardTitle>
            <CardDescription>
              Agregá tus tarjetas de crédito con sus fechas de cierre y pago. Un gasto con tarjeta queda como consumo
              pendiente: no sale de tu cuenta hasta que pagás el periodo. Acá ves cuánto consumiste en cada ciclo, y
              al pagarlo se registra un solo pago desde la cuenta que elijas.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Link key={card.id} href={`/dashboard/tarjetas/${card.id}`} className="group">
              <Card className={cn("h-full transition-colors group-hover:border-primary/40", !card.active && "opacity-60")}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {card.active ? "Tarjeta de crédito" : "Desactivada"}
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                  </div>
                  <CardTitle className="text-lg">{card.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {card.current && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">
                        Ciclo actual · del {formatDayMonth(card.current.start)} al {formatDayMonth(card.current.closing)}
                      </span>
                      <span className="text-2xl font-semibold text-expense tabular-nums">
                        {formatMixed(card.current.spent.pen, card.current.spent.usd)}
                      </span>
                    </div>
                  )}
                  {card.next && (
                    <div className="flex items-center gap-2 border-t pt-3 text-sm">
                      <OccurrenceStatusMark status={card.next.status} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          {STATUS_LABELS[card.next.status]} · paga el {formatTransactionDate(card.next.dueDate)}
                        </p>
                        <p className="font-heading text-xs italic text-muted-foreground">
                          {formatCountdown(daysUntil(card.next.dueDate))}
                        </p>
                      </div>
                      <span className={cn("font-medium tabular-nums", occurrenceAmountClass(card.next.status))}>
                        {formatEntryAmount(card.next)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
