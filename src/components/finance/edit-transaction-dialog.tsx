"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CategoryCombobox } from "@/components/finance/category-combobox";
import { PaymentMethodSelect } from "@/components/finance/payment-method-select";
import { ReceiptLinksField } from "@/components/finance/receipt-links-field";
import { ReasonField } from "@/components/finance/reason-field";
import { useCreateCategory } from "@/components/finance/use-create-category";
import { updateTransaction } from "@/features/transactions/actions";
import { formatCurrency } from "@/lib/format";
import { AMOUNT_LOCK_LABELS, type AmountLock } from "@/lib/transaction-lock";
import type { ReasonSuggestion } from "@/features/categories/queries";
import type { PaymentMethod } from "@/generated/prisma/client";
import type { MovementKind } from "@/lib/labels";

type CategoryOption = { id: string; name: string };
type AccountOption = { id: string; name: string };

export function EditTransactionDialog({
  transactionId,
  kind,
  currentDate,
  currentAmount,
  amountLock,
  currentCategoryId,
  currentPaymentMethod,
  currentCardId,
  currentAccountId,
  accounts = [],
  currentReason,
  currentDescription,
  currentReceiptUrls,
  categories: initialCategories,
  frequentCategoryIds,
  reasonSuggestions,
}: {
  transactionId: string;
  kind: MovementKind;
  currentDate: string;
  currentAmount: number;
  // Gasto de un prepago o comisión de ruleteo: el monto se ve pero no se edita.
  amountLock: { kind: AmountLock; href: string } | null;
  currentCategoryId: string;
  currentPaymentMethod: PaymentMethod | null;
  currentCardId: string | null;
  // Null en un consumo con tarjeta (todavía no salió de ninguna cuenta).
  currentAccountId: string | null;
  // Para elegir de qué cuenta sale un consumo que pasa a otro método.
  accounts?: AccountOption[];
  currentReason: string | null;
  currentDescription: string | null;
  currentReceiptUrls: string[];
  // Las del mismo tipo que el movimiento: no se puede pasar de gasto a ingreso.
  categories: CategoryOption[];
  frequentCategoryIds: string[];
  // Por id de categoría.
  reasonSuggestions: Record<string, ReasonSuggestion[]>;
}) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState(currentCategoryId);
  // Igual que al crear: elegir la categoría por un motivo lo completa.
  const [reasonPrefill, setReasonPrefill] = useState({ key: 0, value: currentReason ?? "" });
  const [method, setMethod] = useState<PaymentMethod | null>(currentPaymentMethod);
  const isCharge = kind === "EXPENSE" && currentAccountId === null;
  // Un consumo que deja de ser con tarjeta pasa a salir de una cuenta.
  const needsAccount = isCharge && method !== "CREDIT_CARD";
  const {
    create: createCategory,
    pending: categoryPending,
    error: categoryError,
    setError: setCategoryError,
  } = useCreateCategory((created) => {
    setCategories((prev) => [...prev, created]);
    setCategoryId(created.id);
  });
  const [state, formAction, pending] = useActionState(
    updateTransaction.bind(null, transactionId),
    null
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  // Al reabrir, arranca de nuevo desde los valores guardados.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setMethod(currentPaymentMethod);
      setCategoryId(currentCategoryId);
      setCategoryError(null);
      setReasonPrefill((prev) => ({ key: prev.key + 1, value: currentReason ?? "" }));
    }
  }

  function handleSelectCategory(id: string, reason?: string) {
    setCategoryId(id);
    setCategoryError(null);
    if (reason) setReasonPrefill((prev) => ({ key: prev.key + 1, value: reason }));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Pencil className="size-4" />
          <span className="sr-only">Editar movimiento</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar movimiento</DialogTitle>
          <DialogDescription>
            {isCharge
              ? "Es un consumo con tarjeta: no sale de ninguna cuenta hasta que pagues su periodo."
              : "El tipo no se puede modificar."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-tx-amount">Monto (S/)</Label>
              {amountLock ? (
                <p
                  id="edit-tx-amount"
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-input bg-muted/60 px-2.5 text-sm tabular-nums"
                >
                  <Lock className="size-3.5 text-muted-foreground" />
                  {formatCurrency(currentAmount)}
                </p>
              ) : (
                <Input
                  id="edit-tx-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  defaultValue={currentAmount.toFixed(2)}
                  className="tabular-nums"
                  required
                />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-tx-date">Fecha</Label>
              <Input id="edit-tx-date" name="date" type="date" defaultValue={currentDate} required />
            </div>
          </div>
          {amountLock && (
            <p className="-mt-2 text-xs text-muted-foreground">
              {AMOUNT_LOCK_LABELS[amountLock.kind]}{" "}
              <Link href={amountLock.href} className="font-medium text-primary hover:underline">
                Ir ahí
              </Link>
            </p>
          )}

          {kind === "EXPENSE" && (
            <PaymentMethodSelect
              key={open ? "open" : "closed"}
              id="edit-tx-payment-method"
              defaultValue={currentPaymentMethod}
              defaultCardId={currentCardId}
              legacyAccountName={
                isCharge ? undefined : (accounts.find((a) => a.id === currentAccountId)?.name ?? null)
              }
              onMethodChange={setMethod}
            />
          )}

          {needsAccount && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-tx-account">Cuenta</Label>
              <Select name="accountId" required>
                <SelectTrigger id="edit-tx-account" className="w-full">
                  <SelectValue placeholder="¿De qué cuenta salió?" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Deja de ser un consumo de la tarjeta y resta de esa cuenta.</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-tx-category">Categoría</Label>
            <input type="hidden" name="categoryId" value={categoryId} />
            <CategoryCombobox
              id="edit-tx-category"
              categories={categories}
              value={categoryId}
              frequentIds={frequentCategoryIds}
              reasonSuggestions={reasonSuggestions}
              creating={categoryPending}
              onSelect={handleSelectCategory}
              onCreate={(name) => createCategory(name, kind)}
            />
            {categoryError && <p className="text-sm text-destructive">{categoryError}</p>}
          </div>

          <ReasonField
            key={reasonPrefill.key}
            id="edit-tx-reason"
            defaultValue={reasonPrefill.value}
            suggestions={reasonSuggestions[categoryId] ?? []}
            canSave={categoryId !== ""}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-tx-description">Descripción (opcional)</Label>
            <Textarea
              id="edit-tx-description"
              name="description"
              defaultValue={currentDescription ?? undefined}
              rows={2}
            />
          </div>

          <ReceiptLinksField id="edit-tx-receipts" defaultValue={currentReceiptUrls} />

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
