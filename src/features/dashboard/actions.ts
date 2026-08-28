"use server";

import { getDashboardSummaryForRange } from "./queries";

export async function getDashboardSummaryForRangeAction(startIso: string, endIso: string) {
  return getDashboardSummaryForRange(new Date(startIso), new Date(endIso));
}
