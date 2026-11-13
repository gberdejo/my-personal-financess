import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

export async function getCalendarFeed(): Promise<{ token: string } | null> {
  const userId = await requireUserId();
  return prisma.calendarFeed.findUnique({ where: { userId }, select: { token: true } });
}
