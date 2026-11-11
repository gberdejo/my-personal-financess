import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarRange, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CardFormDialog } from "@/components/finance/card-form-dialog";
import { ChargeStatusChip } from "@/components/finance/charge-status-chip";
import { ConfirmDeleteButton } from "@/components/finance/confirm-delete-button";
import { EditTransactionDialog } from "@/components/finance/edit-transaction-dialog";
import { LinkCardTransactionsDialog } from "@/components/finance/link-card-transactions-dialog";
import { OccurrenceDialog } from "@/components/finance/occurrence-dialog";
import { OccurrenceStatusMark, occurrenceAmountClass } from "@/components/finance/occurrence-row";
import { getAccounts } from "@/features/accounts/queries";
import { deleteCard } from "@/features/cards/actions";
import { getCardDetail } from "@/features/cards/queries";
import { getCategories, getFrequentCategoryIds, getReasonSuggestions } from "@/features/categories/queries";
import { daysUntil, monthLabel, toUTCDateInputValue } from "@/lib/date";
import {
  formatCountdown,
  formatCurrency,
  formatDate,
  formatDayMonth,
  formatTransactionDate,
  formatTransactionDateTime,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABELS = { PENDING: "Pendiente", OVERDUE: "Vencido", PAID: "Pagado", SKIPPED: "Omitido" } as const;

// "Noviembre de 2026" del mes del cierre.
function cycleTitle(closing: Date) {
  return monthLabel(closing.getUTCFullYear(), closing.getUTCMonth() + 1);
}

export default async function TarjetaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // `ciclo`: "YYYY-MM" del mes del cierre. `pago`: "YYYY-MM-DD" del vencimiento
  // (lo usa el enlace de un pago de tarjeta en Transacciones).
  searchParams: Promise<{ ciclo?: string; pago?: string }>;
}) {
  const [{ id }, { ciclo, pago }] = await Promise.all([params, searchParams]);
  const detail = await getCardDetail(id, { cycle: ciclo, payment: pago });
  if (!detail) notFound();

  const [accounts, categories, frequentCategoryIds, reasonSuggestions] = await Promise.all([
    getAccounts(),
    getCategories("EXPENSE"),
    getFrequentCategoryIds(),
    getReasonSuggestions(),
  ]);

  const { card, cycle, history, charges, candidates, legacyCount } = detail;
  const entry = cycle.entry;
  const paid = entry?.status === "PAID";

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/tarjetas"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Tarjetas
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {card.active ? "Tarjeta de crédito" : "Desactivada"}
          </span>
          <h1 className="font-heading text-2xl font-medium italic md:text-3xl">{card.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <CardFormDialog
            card={{
              id: card.id,
              name: card.name,
              closingDate: toUTCDateInputValue(card.nextClosing),
              dueDate: toUTCDateInputValue(card.nextDue),
              active: card.active,
            }}
          />
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/tarjetas/${card.id}/cronograma?year=${cycle.closing.getUTCFullYear()}`}>
              <CalendarRange />
              Cronograma
            </Link>
          </Button>
          {!card.hasCharges && (
            <ConfirmDeleteButton
              title={`¿Eliminar “${card.name}”?`}
              description="Se borran su cronograma, la deuda ingresada y los ruleteos, y deja de salir en el calendario. Los pagos que ya hiciste se conservan en su cuenta."
              onConfirm={deleteCard.bind(null, card.id)}
            />
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="min-w-0">
            <CardDescription>
              {cycle.isCurrent ? "Ciclo actual" : cycle.isFuture ? "Ciclo siguiente" : "Ciclo anterior"}
              {!cycle.fromSchedule && " · según la regla"}
            </CardDescription>
            <CardTitle className="truncate">Cierre de {cycleTitle(cycle.closing).toLowerCase()}</CardTitle>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="outline" size="icon">
              <Link href={`?ciclo=${cycle.prevKey}`}>
                <ChevronLeft className="size-4" />
                <span className="sr-only">Ciclo anterior</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="icon">
              <Link href={`?ciclo=${cycle.nextKey}`}>
                <ChevronRight className="size-4" />
                <span className="sr-only">Ciclo siguiente</span>
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">
                Consumos del {formatDayMonth(cycle.start)} al {formatDayMonth(cycle.closing)}
              </span>
              <span className="text-2xl font-semibold text-expense tabular-nums">{formatCurrency(cycle.spent)}</span>
              <span className="text-xs text-muted-foreground">
                {charges.length === 1 ? "1 consumo" : `${charges.length} consumos`}
                {charges.length > 0 && (paid ? " · pagados" : " · pendientes de pago")}
              </span>
            </div>

            <div className="flex flex-col gap-2 sm:border-l sm:pl-4">
              <span className="text-xs text-muted-foreground">
                Pago el {formatTransactionDate(cycle.dueDate)}
                {entry && !paid && entry.status !== "SKIPPED" && (
                  <span className="font-heading italic"> · {formatCountdown(daysUntil(cycle.dueDate))}</span>
                )}
              </span>
              {entry ? (
                <>
                  <div className="flex items-center gap-2">
                    <OccurrenceStatusMark status={entry.status} />
                    <span className="text-sm">{STATUS_LABELS[entry.status]}</span>
                    <span className={cn("ml-auto text-lg font-semibold", occurrenceAmountClass(entry.status))}>
                      {formatCurrency(entry.amount)}
                    </span>
                  </div>
                  {cycle.payment && (
                    <p className="text-xs text-muted-foreground">
                      Pagado el {formatDate(cycle.payment.date)}
                      {cycle.payment.accountName && ` desde ${cycle.payment.accountName}`}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <OccurrenceDialog entry={entry} accounts={accounts}>
                      <Button size="sm" variant={paid ? "outline" : "default"}>
                        {paid ? "Pagada" : entry.status === "SKIPPED" ? "Omitida" : "Pagar tarjeta"}
                      </Button>
                    </OccurrenceDialog>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/dashboard/tarjetas/${card.id}/${entry.dueDateValue}`}>
                        Deuda y ruleteo
                        <ArrowRight />
                      </Link>
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Este ciclo es anterior a cuando agregaste la tarjeta: su pago no está en el calendario.
                </p>
              )}
            </div>
          </div>

          {legacyCount > 0 && (
            <p className="flex items-start gap-1.5 rounded-md bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
              <Info className="mt-px size-3.5 shrink-0" />
              {legacyCount === 1
                ? "Hay 1 gasto con tarjeta de crédito en este ciclo que se descontó de una cuenta."
                : `Hay ${legacyCount} gastos con tarjeta de crédito en este ciclo que se descontaron de una cuenta.`}{" "}
              Si son de esta tarjeta, pasalos con “Pasar gastos a la tarjeta”: dejan de restar de su cuenta y se
              pagan con el periodo.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="pb-0 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Consumos del ciclo</CardTitle>
              <CardDescription>No salen de ninguna cuenta hasta que pagás el periodo.</CardDescription>
            </div>
            <LinkCardTransactionsDialog cardId={card.id} cardName={card.name} candidates={candidates} />
          </CardHeader>
          <CardContent className="px-0">
            {charges.length === 0 ? (
              <p className="border-t px-4 py-4 text-sm text-muted-foreground">
                No hay consumos con esta tarjeta en este ciclo.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Fecha</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="hidden sm:table-cell">Categoría</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {charges.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="pl-4 whitespace-nowrap">
                        {formatTransactionDateTime(t.date, t.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-40">
                        <p className="truncate">{t.reason ?? t.description ?? "—"}</p>
                        <p className="truncate text-xs text-muted-foreground sm:hidden">{t.categoryName}</p>
                        <ChargeStatusChip status={paid ? "PAID" : "PENDING"} className="mt-1" />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{t.categoryName}</TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap text-expense tabular-nums">
                        -{formatCurrency(t.amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end">
                          <EditTransactionDialog
                            transactionId={t.id}
                            kind={t.kind}
                            currentDate={toUTCDateInputValue(t.date)}
                            currentAmount={t.amount}
                            amountLock={t.amountLock}
                            currentCategoryId={t.categoryId}
                            currentPaymentMethod={t.paymentMethod}
                            currentCardId={t.cardId}
                            currentAccountId={null}
                            accounts={accounts}
                            currentReason={t.reason}
                            currentDescription={t.description}
                            currentReceiptUrls={t.receiptUrls}
                            categories={categories}
                            frequentCategoryIds={frequentCategoryIds}
                            reasonSuggestions={reasonSuggestions}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="pb-0">
          <CardHeader>
            <CardTitle>Periodos</CardTitle>
            <CardDescription>Consumos de los últimos ciclos.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ul>
              {history.map((c) => (
                <li key={c.key} className="border-t">
                  <Link
                    href={`?ciclo=${c.key}`}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60",
                      c.selected && "bg-muted/60"
                    )}
                  >
                    {c.status ? (
                      <OccurrenceStatusMark status={c.status} />
                    ) : (
                      <span aria-hidden className="size-5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{cycleTitle(c.closing)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDayMonth(c.start)} – {formatDayMonth(c.closing)} · paga {formatDayMonth(c.dueDate)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-expense tabular-nums">
                      {formatCurrency(c.spent)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
