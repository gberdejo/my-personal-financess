import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduledPaymentFormDialog } from "@/components/finance/scheduled-payment-form-dialog";
import type { ScheduleSuggestion } from "@/features/schedule/queries";
import { formatCurrency } from "@/lib/format";

type Option = { id: string; name: string };

export function ScheduleSuggestions({
  suggestions,
  accounts,
  categories,
}: {
  suggestions: ScheduleSuggestion[];
  accounts: Option[];
  categories: Option[];
}) {
  if (suggestions.length === 0) return null;

  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Se repiten cada mes</CardTitle>
        <CardDescription>
          Gastos de tus últimos 6 meses que parecen pagos fijos. Programalos para verlos venir.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ul>
          {suggestions.map((suggestion) => (
            <li key={suggestion.key} className="flex items-center gap-3 border-t px-4 py-2.5">
              <span className="w-8 shrink-0 font-heading text-base text-muted-foreground italic tabular-nums">
                {suggestion.months}×
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{suggestion.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {suggestion.categoryName} · {suggestion.months} de 6 meses · cerca del día {suggestion.day}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(suggestion.amount)}</span>
              <ScheduledPaymentFormDialog
                accounts={accounts}
                categories={categories}
                initial={{
                  type: "BILL",
                  name: suggestion.name,
                  categoryId: suggestion.categoryId,
                  accountId: suggestion.accountId,
                  paymentMethod: suggestion.paymentMethod,
                  amount: suggestion.amount,
                  frequency: "MONTHLY",
                  startDate: suggestion.startDate,
                }}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
