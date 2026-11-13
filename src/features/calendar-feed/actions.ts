"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

export type CalendarFeedState = { error?: string } | null;

function newToken() {
  return randomBytes(24).toString("base64url");
}

// Crea el link si no existe; si ya hay uno, lo conserva.
export async function enableCalendarFeed(
  _prevState: CalendarFeedState,
  _formData: FormData
): Promise<CalendarFeedState> {
  const userId = await requireUserId();
  await prisma.calendarFeed.upsert({
    where: { userId },
    create: { userId, token: newToken() },
    update: {},
  });
  revalidatePath("/dashboard/calendario");
  return null;
}

// El link anterior deja de funcionar.
export async function regenerateCalendarFeed(
  _prevState: CalendarFeedState,
  _formData: FormData
): Promise<CalendarFeedState> {
  const userId = await requireUserId();
  await prisma.calendarFeed.upsert({
    where: { userId },
    create: { userId, token: newToken() },
    update: { token: newToken() },
  });
  revalidatePath("/dashboard/calendario");
  return null;
}

export async function disableCalendarFeed(
  _prevState: CalendarFeedState,
  _formData: FormData
): Promise<CalendarFeedState> {
  const userId = await requireUserId();
  await prisma.calendarFeed.deleteMany({ where: { userId } });
  revalidatePath("/dashboard/calendario");
  return null;
}
