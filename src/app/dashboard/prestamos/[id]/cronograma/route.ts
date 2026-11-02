import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { toLoanCsv } from "@/lib/loan-csv";

// Descarga el cronograma de un préstamo en el formato de la plantilla, para
// corregirlo en Excel y volver a importarlo. Va sin extensión ".csv" en la
// ruta: el matcher de src/proxy.ts deja fuera de Clerk las rutas con extensión.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;

  const payment = await prisma.scheduledPayment.findFirst({
    where: { id, userId, type: "LOAN" },
    select: { name: true, installments: { orderBy: { dueDate: "asc" } } },
  });
  if (!payment) return new Response("Préstamo no encontrado", { status: 404 });

  const csv = toLoanCsv(
    payment.installments.map((row) => ({
      number: row.number,
      dueDate: row.dueDate,
      principal: Number(row.principal),
      interest: Number(row.interest),
      lifeInsurance: Number(row.lifeInsurance),
      otherCharges: Number(row.otherCharges),
      total: Number(row.total),
      balance: Number(row.balance),
    }))
  );
  const slug =
    payment.name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "prestamo";

  // BOM para que Excel abra el archivo como UTF-8.
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cronograma-${slug}.csv"`,
    },
  });
}
