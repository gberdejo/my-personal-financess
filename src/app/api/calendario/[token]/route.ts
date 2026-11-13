import { prisma } from "@/lib/prisma";
import { buildCalendar } from "@/lib/ical";
import { publicOrigin } from "@/lib/origin";
import { buildFeedEvents } from "@/features/calendar-feed/events";

// Feed público de solo lectura: se autentica con el token secreto del link.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const feed = await prisma.calendarFeed.findUnique({ where: { token } });
  if (!feed) return new Response("No encontrado", { status: 404 });

  // Los links "Abrir" de cada evento usan el dominio público, no el interno.
  const origin = publicOrigin(request.headers)?.origin ?? new URL(request.url).origin;
  const events = await buildFeedEvents(feed.userId, origin);
  const body = buildCalendar({ name: "Mis pagos", events });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="pagos.ics"',
    },
  });
}
