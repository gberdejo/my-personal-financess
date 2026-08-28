import { DashboardOverview } from "@/components/finance/dashboard-overview";
import { getDashboardSummaryForRange } from "@/features/dashboard/queries";
import { monthRange, parseMonthParam } from "@/lib/date";

export default async function DashboardPage() {
  const { year, month } = parseMonthParam();
  const { start, end } = monthRange(year, month);
  const summary = await getDashboardSummaryForRange(start, end);

  return <DashboardOverview initialSummary={summary} initialYear={year} initialMonth={month} />;
}
