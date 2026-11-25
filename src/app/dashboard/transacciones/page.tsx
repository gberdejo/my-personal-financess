import Link from "next/link";
import { CreditCard, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PeriodSelection } from "@/components/finance/period-range-filter";
import { TransactionsFilters } from "@/components/finance/transactions-filters";
import { ConfirmDeleteButton } from "@/components/finance/confirm-delete-button";
import { EditTransactionDialog } from "@/components/finance/edit-transaction-dialog";
import { EditUsdPaymentDialog } from "@/components/finance/edit-usd-payment-dialog";
import { ReceiptsDialog } from "@/components/finance/receipts-dialog";
import { ChargeStatusChip } from "@/components/finance/charge-status-chip";
import { TransactionFormDialog } from "@/components/finance/transaction-form-dialog";
import { getAccounts } from "@/features/accounts/queries";
import { getCategories, getFrequentCategoryIds, getReasonSuggestions } from "@/features/categories/queries";
import { deleteTransaction } from "@/features/transactions/actions";
import { getTransactionsForRange, type PaymentMethodFilter as MethodFilter } from "@/features/transactions/queries";
import { getCreditCardOptions } from "@/features/cards/queries";
import { monthRange, parseMonthParam, shiftDay, todayInLima, toUTCDateInputValue } from "@/lib/date";
import { getPresetRange, isPeriodPreset, periodNowInLima } from "@/lib/period";
import { formatCurrency, formatRate, formatTransactionDateTime, formatUsd } from "@/lib/format";
import { isPaymentMethod, NO_PAYMENT_METHOD_LABEL, parseKindParam, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { IMPORT_SOURCES, isImportSource } from "@/lib/imports/sources";
import { normalizeReason } from "@/lib/reason";

function parseMethodParam(raw: string | undefined): MethodFilter | null {
  if (!raw) return null;
  if (raw === "NONE" || isPaymentMethod(raw)) return raw;
  return null;
}

// Los movimientos anteriores al motivo lo heredaron de la descripción: no
// tiene sentido mostrar el mismo texto dos veces.
function extraDescription(reason: string | null, description: string | null) {
  if (!description) return null;
  if (reason && normalizeReason(reason) === normalizeReason(description)) return null;
  return description;
}

function sumKind(transactions: { kind: string; amount: number }[], kind: string) {
  return transactions.filter((t) => t.kind === kind).reduce((sum, t) => sum + t.amount, 0);
}

function countLabel(count: number, kind: "INCOME" | "EXPENSE" | null) {
  const [singular, plural] =
    kind === "INCOME" ? ["ingreso", "ingresos"] : kind === "EXPENSE" ? ["gasto", "gastos"] : ["movimiento", "movimientos"];
  return `${count} ${count === 1 ? singular : plural}`;
}

type SearchParams = {
  // "ingresos" o "gastos"; sin él, todos.
  tipo?: string;
  periodo?: string;
  desde?: string;
  hasta?: string;
  month?: string;
  method?: string;
  account?: string;
  // Con method=CREDIT_CARD: id de la tarjeta.
  tarjeta?: string;
};

// Periodo elegido: `?periodo=` (con `desde`/`hasta` si es personalizado), o
// `?month=YYYY-MM` de los enlaces anteriores como rango de ese mes. Por defecto, este mes.
function readPeriod(params: SearchParams): PeriodSelection {
  const now = periodNowInLima();
  const thisMonth = monthRange(now.getFullYear(), now.getMonth() + 1);
  const defaults = {
    customStart: toUTCDateInputValue(thisMonth.start),
    customEnd: toUTCDateInputValue(todayInLima()),
  };
  if (params.periodo && isPeriodPreset(params.periodo)) {
    return {
      preset: params.periodo,
      customStart: params.desde ?? defaults.customStart,
      customEnd: params.hasta ?? defaults.customEnd,
    };
  }
  if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
    const { year, month } = parseMonthParam(params.month);
    const { start, end } = monthRange(year, month);
    return { preset: "custom", customStart: toUTCDateInputValue(start), customEnd: toUTCDateInputValue(shiftDay(end, -1)) };
  }
  return { preset: "thisMonth", ...defaults };
}

export default async function TransaccionesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const period = readPeriod(params);
  const now = periodNowInLima();
  const range =
    getPresetRange(period.preset, period.customStart, period.customEnd, now) ??
    monthRange(now.getFullYear(), now.getMonth() + 1);
  const kindParam = parseKindParam(params.tipo);
  // El método de pago solo existe en gastos: con Ingresos se ignora, y con un método el tipo es Gastos.
  const method = kindParam === "INCOME" ? null : parseMethodParam(params.method);
  const kind = method ? "EXPENSE" : kindParam;
  const accountParam = params.account;

  const [accounts, cards] = await Promise.all([getAccounts(), getCreditCardOptions()]);
  // Solo una cuenta propia: un id ajeno o viejo en la URL se ignora.
  const account = accounts.find((a) => a.id === accountParam) ?? null;
  // Lo mismo con la tarjeta; solo cuenta junto con el método tarjeta de crédito.
  const filteredCard = cards.find((c) => c.id === params.tarjeta);
  const cardFilter = method === "CREDIT_CARD" && filteredCard ? { id: filteredCard.id, label: filteredCard.name } : null;
  // Cambia cuando cambian los filtros aplicados (URL), para reiniciar los que se están eligiendo.
  const filtersKey = [kind, period.preset, period.customStart, period.customEnd, account?.id, method, cardFilter?.id].join("|");

  const [transactions, incomeCategories, expenseCategories, reasonSuggestions, frequentCategoryIds] =
    await Promise.all([
      getTransactionsForRange(range.start, range.end, method ?? undefined, account?.id, cardFilter?.id, kind ?? undefined),
      getCategories("INCOME"),
      getCategories("EXPENSE"),
      getReasonSuggestions(),
      getFrequentCategoryIds(),
    ]);

  const totals = {
    income: sumKind(transactions, "INCOME"),
    expense: sumKind(transactions, "EXPENSE"),
    cardPayments: sumKind(transactions, "CARD_PAYMENT"),
  };
  // "de BCP", "con Yape", "con Visa", "sin método de pago".
  const methodContext = cardFilter
    ? `con ${cardFilter.label}`
    : method === "NONE"
      ? "sin método de pago"
      : method
        ? `con ${PAYMENT_METHOD_LABELS[method]}`
        : null;
  const filterContext = [account ? `de ${account.name}` : null, methodContext].filter(Boolean).join(" ");
  const hasActiveFilters = kind !== null || account !== null || method !== null;
  // Limpiar quita tipo, cuenta y método, pero conserva el periodo.
  const clearParams = new URLSearchParams();
  for (const key of ["periodo", "desde", "hasta", "month"] as const) {
    const value = params[key];
    if (value) clearParams.set(key, value);
  }
  const clearHref = clearParams.size ? `/dashboard/transacciones?${clearParams}` : "/dashboard/transacciones";
  const emptyMessage = method
    ? "No hay gastos con este método de pago en este periodo."
    : `No hay ${kind === "INCOME" ? "ingresos" : kind === "EXPENSE" ? "gastos" : "transacciones"}${
        account ? ` de ${account.name}` : ""
      } en este periodo.`;

  return (
    <div className="flex flex-col gap-4">
      {/* Crear va arriba, separado de consultar. */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-medium italic md:text-3xl">Transacciones</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/importaciones">
              <FileUp />
              <span className="sr-only sm:not-sr-only">Importar</span>
            </Link>
          </Button>
          <TransactionFormDialog
            accounts={accounts}
            incomeCategories={incomeCategories}
            expenseCategories={expenseCategories}
            frequentCategoryIds={frequentCategoryIds}
            reasonSuggestions={reasonSuggestions}
            defaultKind={kind}
            defaultPaymentMethod={method && method !== "NONE" ? method : null}
            defaultCardId={cardFilter?.id ?? null}
            defaultAccountId={account?.id ?? null}
          />
        </div>
      </div>

      <TransactionsFilters
        key={filtersKey}
        accounts={accounts}
        kind={kind}
        period={period}
        account={account?.id ?? null}
        method={method}
        card={cardFilter?.id ?? null}
      />

      {(transactions.length > 0 || hasActiveFilters) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-sm text-muted-foreground">
          {transactions.length > 0 ? (
            <p className="tabular-nums">
              {countLabel(transactions.length, kind)}
              {filterContext && ` ${filterContext}`}
              {kind !== "EXPENSE" && (
                <>
                  {" · Ingresos "}
                  <span className="font-medium text-income">{formatCurrency(totals.income)}</span>
                </>
              )}
              {kind !== "INCOME" && (
                <>
                  {" · Gastos "}
                  <span className="font-medium text-expense">{formatCurrency(totals.expense)}</span>
                </>
              )}
              {/* Aparte: sumarlos a Gastos contaría dos veces lo consumido con tarjeta. */}
              {!kind && totals.cardPayments > 0 && ` · Pagos de tarjeta ${formatCurrency(totals.cardPayments)}`}
            </p>
          ) : (
            <span />
          )}
          {hasActiveFilters && (
            <Link href={clearHref} className="font-medium text-primary hover:underline">
              Limpiar filtros
            </Link>
          )}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead className="hidden sm:table-cell">Cuenta</TableHead>
            <TableHead className="hidden md:table-cell">Método</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((t) => {
              // Sin motivo, la descripción ocupa su lugar.
              const description = t.reason ? extraDescription(t.reason, t.description) : null;
              return (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatTransactionDateTime(t.date, t.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-40">
                    <p className="truncate">{t.reason ?? t.description ?? "—"}</p>
                    {description && (
                      <p className="truncate text-xs text-muted-foreground" title={description}>
                        {description}
                      </p>
                    )}
                    {t.budget && (
                      <Link
                        href={`/dashboard/presupuestos/${t.budget.id}`}
                        className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        de {t.budget.title}
                      </Link>
                    )}
                    {t.imports.map((item) => (
                      <Link
                        key={item.importId}
                        href={`/dashboard/importaciones/${item.importId}?estado=aplicados`}
                        className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        <FileUp className="size-3 shrink-0" />
                        {item.created ? "importado de" : "vinculado a"}{" "}
                        {isImportSource(item.source) ? IMPORT_SOURCES[item.source].label : item.source}
                      </Link>
                    ))}
                  </TableCell>
                  <TableCell>
                    {t.categoryName}
                    {t.paymentMethod && (
                      <p className="text-xs text-muted-foreground md:hidden">
                        {PAYMENT_METHOD_LABELS[t.paymentMethod]}
                        {t.cardName && ` · ${t.cardName}`}
                      </p>
                    )}
                    {t.charge && <ChargeStatusChip status={t.charge.status} className="mt-1 sm:hidden" />}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {t.charge ? (
                      // Consumo: todavía no salió de ninguna cuenta (o salió con el pago del periodo).
                      <Link href={t.charge.href} className="flex flex-col gap-1 hover:underline">
                        <span>{t.cardName}</span>
                        <ChargeStatusChip status={t.charge.status} />
                      </Link>
                    ) : (
                      t.accountName
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {t.kind === "CARD_PAYMENT" ? (
                      <span className="text-muted-foreground">Pago de tarjeta</span>
                    ) : t.kind === "EXPENSE" ? (
                      t.paymentMethod ? (
                        PAYMENT_METHOD_LABELS[t.paymentMethod]
                      ) : (
                        <span className="text-muted-foreground">{NO_PAYMENT_METHOD_LABEL}</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums whitespace-nowrap ${
                      t.kind === "INCOME" ? "text-income" : "text-expense"
                    }`}
                  >
                    {t.kind === "INCOME" ? "+" : "-"}
                    {t.currency === "USD" && t.foreignAmount !== null ? (
                      <>
                        {formatUsd(t.foreignAmount)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t.exchangeRate !== null
                            ? `S/ ${t.amount.toFixed(2)} · TC ${formatRate(t.exchangeRate)}`
                            : `≈ S/ ${t.amount.toFixed(2)} (estimado)`}
                        </span>
                      </>
                    ) : (
                      formatCurrency(t.amount)
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <ReceiptsDialog urls={t.receiptUrls} title={t.reason ?? t.description ?? undefined} />
                      {t.kind === "CARD_PAYMENT" ? (
                        // El pago se ve y se deshace desde el periodo que pagó.
                        <>
                          {t.isUsdPayment && t.foreignAmount !== null && t.exchangeRate !== null && (
                            <EditUsdPaymentDialog
                              transactionId={t.id}
                              currentDate={toUTCDateInputValue(t.date)}
                              currentUsd={t.foreignAmount}
                              currentRate={t.exchangeRate}
                            />
                          )}
                          {t.cardPaymentHref && (
                            <Button asChild variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                              <Link href={t.cardPaymentHref}>
                                <CreditCard className="size-4" />
                                <span className="sr-only">Ver el periodo pagado</span>
                              </Link>
                            </Button>
                          )}
                        </>
                      ) : (
                      <EditTransactionDialog
                        transactionId={t.id}
                        kind={t.kind}
                        currentDate={toUTCDateInputValue(t.date)}
                        currentAmount={t.amount}
                        currentCurrency={t.currency}
                        currentForeignAmount={t.foreignAmount}
                        currentExchangeRate={t.exchangeRate}
                        amountLock={t.amountLock}
                        currentCategoryId={t.categoryId}
                        currentPaymentMethod={t.paymentMethod}
                        currentCardId={t.cardId}
                        currentAccountId={t.accountId}
                        accounts={accounts}
                        currentReason={t.reason}
                        currentDescription={t.description}
                        currentReceiptUrls={t.receiptUrls}
                        categories={t.kind === "INCOME" ? incomeCategories : expenseCategories}
                        frequentCategoryIds={frequentCategoryIds}
                        reasonSuggestions={reasonSuggestions}
                      />
                      )}
                      <ConfirmDeleteButton
                        title={t.kind === "CARD_PAYMENT" ? "¿Eliminar este pago de tarjeta?" : "¿Eliminar este movimiento?"}
                        description={
                          t.kind === "CARD_PAYMENT"
                            ? "El periodo de la tarjeta vuelve a quedar pendiente, se borra también su pago en soles o en dólares y el monto vuelve a la cuenta."
                            : "Esta acción no se puede deshacer."
                        }
                        onConfirm={deleteTransaction.bind(null, t.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
