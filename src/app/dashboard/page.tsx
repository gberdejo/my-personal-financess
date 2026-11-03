import { DashboardOverview } from "@/components/finance/dashboard-overview";
import { getAccounts } from "@/features/accounts/queries";
import { getDashboardSummaryForRange } from "@/features/dashboard/queries";
import { monthRange, parseMonthParam } from "@/lib/date";

export default async function DashboardPage() {
  const { year, month } = parseMonthParam();
  const { start, end } = monthRange(year, month);
  const [summary, accounts] = await Promise.all([getDashboardSummaryForRange(start, end), getAccounts()]);

  return (
    <DashboardOverview initialSummary={summary} initialYear={year} initialMonth={month} accounts={accounts} />
  );
}
