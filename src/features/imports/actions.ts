"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { readSheet } from "@/lib/imports/read-sheet";
import { IMPORT_SOURCES, isImportSource, movementFingerprint } from "@/lib/imports/sources";
import { isPaymentMethod } from "@/lib/labels";
import { normalizeReason } from "@/lib/reason";
import { saveCategoryReason } from "@/features/categories/reasons";

export type ImportActionState = { error?: string } | null;

// El límite de las Server Actions es 1 MB; los reportes pesan unos KB.
const MAX_FILE_BYTES = 900 * 1024;

// Aplicar muchos movimientos crea una transacción por cada uno: más que los 5 s por defecto.
const LONG_TRANSACTION = { timeout: 60_000, maxWait: 10_000 };

function revalidateImports() {
  revalidatePath("/dashboard/importaciones", "layout");
}

// Aplicar o quitar movimientos crea o borra transacciones.
function revalidateWithTransactions() {
  revalidateImports();
  revalidatePath("/dashboard/transacciones");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cuentas");
  revalidatePath("/dashboard/calendario", "layout");
}

async function findOwnAccount(userId: string, accountId: string) {
  if (!accountId) return null;
  return prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
}

export async function createImport(_prevState: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const userId = await requireUserId();

  const source = String(formData.get("source") ?? "");
  const file = formData.get("file");
  if (!isImportSource(source)) return { error: "Elegí de dónde viene el archivo." };
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí el archivo." };
  if (file.size > MAX_FILE_BYTES) return { error: "El archivo es muy grande (máximo 900 KB)." };
  const account = await findOwnAccount(userId, String(formData.get("accountId") ?? ""));
  if (!account) return { error: "Elegí la cuenta de los movimientos." };
  const definition = IMPORT_SOURCES[source];
  // Si la fuente no fija el método de pago (plantilla genérica), se elige al importar.
  const rawMethod = String(formData.get("paymentMethod") ?? "");
  const paymentMethod = definition.paymentMethod ?? (isPaymentMethod(rawMethod) ? rawMethod : null);
  if (!paymentMethod) return { error: "Elegí el método de pago de los gastos." };

  let rows: string[][];
  try {
    rows = readSheet(await file.arrayBuffer());
  } catch {
    return { error: "No se pudo leer el archivo. Tiene que ser Excel (.xlsx, .xls) o CSV." };
  }
  const parsed = definition.parse(rows);
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    const more = parsed.errors.length > 1 ? ` (y ${parsed.errors.length - 1} más)` : "";
    return { error: `${first.row ? `Fila ${first.row}: ` : ""}${first.message}${more}` };
  }

  // Los que ya se importaron antes (en cualquier estado) se saltan: siguen en su importación.
  const withFingerprint = parsed.movements.map((m) => ({ ...m, fingerprint: movementFingerprint(source, m) }));
  const existing = await prisma.importedMovement.findMany({
    where: { userId, fingerprint: { in: withFingerprint.map((m) => m.fingerprint) } },
    select: { fingerprint: true },
  });
  const known = new Set(existing.map((m) => m.fingerprint));
  const movements = withFingerprint.filter((m) => !known.has(m.fingerprint));
  const skippedCount = withFingerprint.length - movements.length;
  if (movements.length === 0) {
    return {
      error: `No hay movimientos nuevos: ${skippedCount === 1 ? "el movimiento ya estaba importado" : `los ${skippedCount} movimientos ya estaban importados`}.`,
    };
  }

  // Periodo que cubre el archivo (incluye los saltados).
  const times = withFingerprint.map((m) => m.date.getTime());
  const created = await prisma.transactionImport.create({
    data: {
      userId,
      source,
      fileName: file.name.slice(0, 200),
      accountId: account.id,
      periodStart: new Date(Math.min(...times)),
      periodEnd: new Date(Math.max(...times)),
      skippedCount,
      paymentMethod: definition.paymentMethod ? null : paymentMethod,
      movements: {
        createMany: {
          data: movements.map((m) => ({
            userId,
            row: m.row,
            occurredAt: m.occurredAt,
            date: m.date,
            kind: m.kind,
            amount: m.amount,
            counterparty: m.counterparty,
            message: m.message,
            rawType: m.rawType,
            fingerprint: m.fingerprint,
            categoryName: m.categoryName ?? null,
            reason: m.reason ?? null,
            paymentMethod: m.paymentMethod ?? null,
            receiptUrls: m.receiptUrls ?? [],
          })),
        },
      },
    },
  });

  revalidateImports();
  redirect(`/dashboard/importaciones/${created.id}`);
}

// `saveReason`: motivo escrito nuevo, que se guarda como sugerencia de la categoría.
type ApplyItem = { id: string; categoryId: string; accountId: string; reason: string; saveReason: boolean };

function readItems(formData: FormData): ApplyItem[] | null {
  try {
    const raw = JSON.parse(String(formData.get("items") ?? "[]"));
    if (!Array.isArray(raw)) return null;
    return raw.map((item) => ({
      id: String(item?.id ?? ""),
      categoryId: String(item?.categoryId ?? ""),
      accountId: String(item?.accountId ?? ""),
      reason: String(item?.reason ?? "").trim(),
      saveReason: item?.saveReason === true,
    }));
  } catch {
    return null;
  }
}

// Crea una transacción por cada movimiento elegido, con la categoría, motivo y
// cuenta que se eligieron en la tabla.
export async function applyMovements(
  importId: string,
  _prevState: ImportActionState,
  formData: FormData
): Promise<ImportActionState> {
  const userId = await requireUserId();

  const items = readItems(formData);
  if (!items || items.length === 0) return { error: "Elegí al menos un movimiento." };
  if (items.some((item) => !item.categoryId)) return { error: "Todos los movimientos necesitan categoría." };
  if (new Set(items.map((i) => i.id)).size !== items.length) return { error: "Hay movimientos repetidos." };

  const item = await prisma.transactionImport.findFirst({
    where: { id: importId, userId },
    select: { source: true, paymentMethod: true },
  });
  if (!item || !isImportSource(item.source)) return { error: "Importación inválida." };
  const definition = IMPORT_SOURCES[item.source];

  const [movements, categories, accounts] = await Promise.all([
    prisma.importedMovement.findMany({ where: { id: { in: items.map((i) => i.id) }, importId, userId } }),
    prisma.category.findMany({
      where: { id: { in: items.map((i) => i.categoryId) }, OR: [{ userId: null }, { userId }] },
      select: { id: true, kind: true },
    }),
    prisma.account.findMany({ where: { id: { in: items.map((i) => i.accountId) }, userId }, select: { id: true } }),
  ]);
  const movementById = new Map(movements.map((m) => [m.id, m]));
  const kindByCategory = new Map(categories.map((c) => [c.id, c.kind]));
  const accountIds = new Set(accounts.map((a) => a.id));

  for (const applyItem of items) {
    const movement = movementById.get(applyItem.id);
    if (!movement) return { error: "Hay un movimiento que no es de esta importación." };
    if (movement.transactionId) return { error: "Hay movimientos que ya se aplicaron. Recargá la página." };
    if (kindByCategory.get(applyItem.categoryId) !== movement.kind) {
      return { error: "Hay una categoría que no corresponde al tipo de movimiento (gasto o ingreso)." };
    }
    if (!accountIds.has(applyItem.accountId)) return { error: "Hay un movimiento sin cuenta válida." };
  }

  // Método de pago de un gasto: el de la fila, el elegido al importar o el de la fuente.
  const methodOf = (movement: (typeof movements)[number]) =>
    movement.kind === "EXPENSE" ? (movement.paymentMethod ?? item.paymentMethod ?? definition.paymentMethod) : null;
  if (movements.some((m) => m.kind === "EXPENSE" && !methodOf(m))) {
    return { error: "Hay gastos sin método de pago." };
  }

  await prisma.$transaction(async (tx) => {
    for (const applyItem of items) {
      const movement = movementById.get(applyItem.id)!;
      const transaction = await tx.transaction.create({
        data: {
          userId,
          accountId: applyItem.accountId,
          categoryId: applyItem.categoryId,
          kind: movement.kind,
          amount: movement.amount,
          reason: applyItem.reason || null,
          description: definition.describe(movement),
          date: movement.date,
          // La hora que se muestra en Transacciones es la de la operación.
          createdAt: movement.occurredAt,
          paymentMethod: methodOf(movement),
          receiptUrls: movement.receiptUrls,
        },
      });
      await tx.importedMovement.update({
        where: { id: movement.id },
        data: { transactionId: transaction.id, createdTransaction: true, discarded: false },
      });
    }
  }, LONG_TRANSACTION);

  // Los motivos nuevos quedan como sugerencia de su categoría (si ya existían, no pasa nada).
  const newReasons = new Map<string, { categoryId: string; reason: string }>();
  for (const applyItem of items) {
    if (!applyItem.saveReason || !applyItem.reason) continue;
    newReasons.set(`${applyItem.categoryId}|${normalizeReason(applyItem.reason)}`, applyItem);
  }
  for (const { categoryId, reason } of newReasons.values()) {
    await saveCategoryReason(userId, categoryId, reason);
  }
  if (newReasons.size > 0) revalidatePath("/dashboard/categorias");

  revalidateWithTransactions();
  return null;
}

// Vincula el movimiento a una transacción que ya estaba registrada (no crea otra).
export async function linkMovement(movementId: string, transactionId: string) {
  const userId = await requireUserId();

  const [movement, transaction] = await Promise.all([
    prisma.importedMovement.findFirst({ where: { id: movementId, userId }, select: { id: true, kind: true } }),
    prisma.transaction.findFirst({ where: { id: transactionId, userId }, select: { id: true, kind: true } }),
  ]);
  if (!movement || !transaction || movement.kind !== transaction.kind) return;

  await prisma.importedMovement.update({
    where: { id: movement.id },
    data: { transactionId: transaction.id, createdTransaction: false, discarded: false },
  });
  revalidateImports();
}

// Si la transacción la creó el movimiento, se borra (vuelve a pendiente, igual
// que cualquier otro movimiento vinculado a ella). Si estaba vinculado, solo se desvincula.
export async function unapplyMovement(movementId: string) {
  const userId = await requireUserId();

  const movement = await prisma.importedMovement.findFirst({ where: { id: movementId, userId } });
  if (!movement?.transactionId) return;

  if (movement.createdTransaction) {
    await prisma.transaction.deleteMany({ where: { id: movement.transactionId, userId } });
    revalidateWithTransactions();
  } else {
    await prisma.importedMovement.update({
      where: { id: movement.id },
      data: { transactionId: null, createdTransaction: false },
    });
    revalidateImports();
  }
}

// Descartar (no se van a aplicar) o devolver a pendientes. No toca los aplicados.
export async function setMovementsDiscarded(importId: string, movementIds: string[], discarded: boolean) {
  const userId = await requireUserId();

  await prisma.importedMovement.updateMany({
    where: { id: { in: movementIds }, importId, userId, transactionId: null },
    data: { discarded },
  });
  revalidateImports();
}

// Borra la importación y sus movimientos. Las transacciones ya aplicadas se quedan.
export async function deleteImport(importId: string) {
  const userId = await requireUserId();

  await prisma.transactionImport.deleteMany({ where: { id: importId, userId } });
  revalidateImports();
  redirect("/dashboard/importaciones");
}
