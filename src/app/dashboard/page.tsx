import { DashboardOverview } from "@/components/finance/dashboard-overview";
import { getAccounts } from "@/features/accounts/queries";
import { getDashboardSummaryForRange } from "@/features/dashboard/queries";
import { toUTCDateInputValue } from "@/lib/date";
import { getPresetRange, periodNowInLima } from "@/lib/period";

export default async function DashboardPage() {
  const accounts = await getAccounts();
  // Carga inicial liviana: últimos 7 días y la primera cuenta creada (getAccounts ordena por createdAt asc).
  const range = getPresetRange("last7Days", "", "", periodNowInLima());
  if (!range) throw new Error("No se pudo calcular el rango de los últimos 7 días");
  const initialAccountId = accounts[0]?.id ?? null;
  const summary = await getDashboardSummaryForRange(range.start, range.end, initialAccountId);

  return (
    <DashboardOverview
      initialSummary={summary}
      initialStart={toUTCDateInputValue(range.start)}
      initialAccountId={initialAccountId}
      accounts={accounts}
    />
  );
}
