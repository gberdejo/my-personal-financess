"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import type { AccountType } from "@/generated/prisma/client";

export type ActionState = { error?: string } | null;

const ACCOUNT_TYPES: AccountType[] = ["CASH", "BANK", "CREDIT_CARD", "INVESTMENT"];

export async function createAccount(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "") as AccountType;
  const initialBalance = Number(formData.get("initialBalance") ?? 0);

  if (!name) return { error: "El nombre es obligatorio." };
  if (!ACCOUNT_TYPES.includes(type)) return { error: "Elegí un tipo de cuenta válido." };
  if (Number.isNaN(initialBalance)) return { error: "El saldo inicial no es válido." };

  await prisma.account.create({
    data: { userId, name, type, initialBalance },
  });

  revalidatePath("/dashboard/cuentas");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transacciones");

  return null;
}

export async function deleteAccount(accountId: string) {
  const userId = await requireUserId();

  await prisma.account.deleteMany({ where: { id: accountId, userId } });

  revalidatePath("/dashboard/cuentas");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transacciones");
}
