import Link from "next/link";
import { CalendarRange, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDeleteButton } from "@/components/finance/confirm-delete-button";
import { ScheduledPaymentFormDialog } from "@/components/finance/scheduled-payment-form-dialog";
import { deleteScheduledPayment } from "@/features/schedule/actions";
import type { ScheduledPaymentRow } from "@/features/schedule/queries";
import { toUTCDateInputValue } from "@/lib/date";
import { formatCurrency, formatDate, formatDayMonth } from "@/lib/format";
import { SCHEDULE_FREQUENCY_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

function ruleLabel(payment: ScheduledPaymentRow) {
  if (payment.type === "LOAN") return ["Préstamo", payment.categoryName].filter(Boolean).join(" · ");
  if (payment.type === "CREDIT_CARD") {
    return payment.nextClosingDate
      ? `Tarjeta · cierra el ${formatDayMonth(payment.nextClosingDate)}`
      : "Tarjeta de crédito";
  }
  return [SCHEDULE_FREQUENCY_LABELS[payment.frequency], payment.categoryName].filter(Boolean).join(" · ");
}

function nextLabel(payment: ScheduledPaymentRow) {
  if (!payment.active) return "Pausado";
  return payment.nextDate ? `Próximo: ${formatDate(payment.nextDate)}` : "Sin fechas pendientes";
}

export function ScheduledPaymentsList({
  payments,
  accounts,
  categories,
}: {
  payments: ScheduledPaymentRow[];
  accounts: Option[];
  categories: Option[];
}) {
  const hasCard = payments.some((p) => p.type === "CREDIT_CARD");

  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Pagos programados</CardTitle>
        <CardDescription>Las reglas que arman el calendario.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ul>
          {payments.map((payment) => (
            <li
              key={payment.id}
              className={cn("flex items-center gap-3 border-t px-4 py-2.5", !payment.active && "opacity-60")}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{payment.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {ruleLabel(payment)} · {nextLabel(payment)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {payment.type === "CREDIT_CARD" ? (
                  <span className="text-xs font-normal text-muted-foreground">Estimado</span>
                ) : payment.amount != null ? (
                  formatCurrency(payment.amount)
                ) : (
                  <span className="text-xs font-normal text-muted-foreground">Sin monto</span>
                )}
              </span>
              <div className="flex shrink-0 items-center">
                {payment.type === "LOAN" && (
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Link href={`/dashboard/prestamos/${payment.id}`}>
                      <HandCoins className="size-4" />
                      <span className="sr-only">Ver préstamo</span>
                    </Link>
                  </Button>
                )}
                {payment.type === "CREDIT_CARD" && (
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Link href={`/dashboard/calendario/tarjeta/${payment.id}`}>
                      <CalendarRange className="size-4" />
                      <span className="sr-only">Cronograma de facturación</span>
                    </Link>
                  </Button>
                )}
                {payment.type !== "LOAN" && (
                  <ScheduledPaymentFormDialog
                    accounts={accounts}
                    categories={categories}
                    hasCard={hasCard}
                    payment={{
                      id: payment.id,
                      type: payment.type,
                      name: payment.name,
                      categoryId: payment.categoryId,
                      accountId: payment.accountId,
                      paymentMethod: payment.paymentMethod,
                      amount: payment.amount,
                      frequency: payment.frequency,
                      startDate: toUTCDateInputValue(payment.startDate),
                      endDate: payment.endDate ? toUTCDateInputValue(payment.endDate) : null,
                      closingDate: payment.nextClosingDate ? toUTCDateInputValue(payment.nextClosingDate) : null,
                      dueDate: payment.nextDate ? toUTCDateInputValue(payment.nextDate) : null,
                      active: payment.active,
                    }}
                  />
                )}
                <ConfirmDeleteButton
                  title={`¿Eliminar “${payment.name}”?`}
                  description="Deja de aparecer en el calendario. Los gastos que ya registraste con este pago se conservan en Transacciones."
                  onConfirm={deleteScheduledPayment.bind(null, payment.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
