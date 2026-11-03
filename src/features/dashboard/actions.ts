"use server";

import { getDashboardSummaryForRange } from "./queries";

export async function getDashboardSummaryForRangeAction(startIso: string, endIso: string, accountId: string | null) {
  return getDashboardSummaryForRange(new Date(startIso), new Date(endIso), accountId);
}
