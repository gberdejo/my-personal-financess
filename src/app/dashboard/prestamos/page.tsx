import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoanFormDialog } from "@/components/finance/loan-form-dialog";
import { LoanProgress } from "@/components/finance/loan-progress";
import { getAccounts } from "@/features/accounts/queries";
import { getCategories } from "@/features/categories/queries";
import { getLoans } from "@/features/loans/queries";
import { daysUntil } from "@/lib/date";
import { formatCountdown, formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function PrestamosPage() {
  const [loans, accounts, categories] = await Promise.all([getLoans(), getAccounts(), getCategories("EXPENSE")]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-medium italic md:text-3xl">Préstamos</h1>
        <LoanFormDialog accounts={accounts} categories={categories} />
      </div>

      {loans.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sin préstamos todavía</CardTitle>
            <CardDescription>
              Registrá un préstamo con su monto, tasa y número de cuotas para armar el cronograma. Las cuotas aparecen
              en el calendario y, al pagarlas, se registran como gasto. Si tu banco te dio un cronograma, podés ajustar
              cada cuota para que coincida.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {loans.map((loan) => {
            const days = loan.next ? daysUntil(loan.next.dueDate) : null;
            return (
              <Link
                key={loan.id}
                href={`/dashboard/prestamos/${loan.id}`}
                className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Card className={cn("h-full transition-colors group-hover:bg-muted/40", !loan.active && "opacity-60")}>
                  <div className="flex flex-col gap-4 px-(--card-spacing)">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {loan.lender ?? "Préstamo"}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Cuota {Math.min(loan.paidCount + 1, loan.installmentCount)} de {loan.installmentCount}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <p className="truncate font-medium">{loan.name}</p>
                      {loan.next && days !== null ? (
                        <p className={cn("font-heading text-base italic", loan.next.overdue && "text-destructive")}>
                          {formatCurrency(loan.next.total)} · {formatCountdown(days)}
                        </p>
                      ) : (
                        <p className="font-heading text-base text-income italic">Cancelado</p>
                      )}
                    </div>
                    <LoanProgress principal={loan.principal} balance={loan.balance} />
                    <p className="text-xs text-muted-foreground">
                      Falta pagar{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatCurrency(loan.remainingToPay)}
                      </span>
                      {loan.lastDueDate && ` · hasta ${formatDate(loan.lastDueDate)}`}
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
