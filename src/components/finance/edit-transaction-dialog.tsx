"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { CategoryCombobox } from "@/components/finance/category-combobox";
import { PaymentMethodSelect } from "@/components/finance/payment-method-select";
import { ReasonField } from "@/components/finance/reason-field";
import { useCreateCategory } from "@/components/finance/use-create-category";
import { updateTransaction } from "@/features/transactions/actions";
import type { ReasonSuggestion } from "@/features/categories/queries";
import type { PaymentMethod, TransactionKind } from "@/generated/prisma/client";

type CategoryOption = { id: string; name: string };

export function EditTransactionDialog({
  transactionId,
  kind,
  currentDate,
  currentCategoryId,
  currentPaymentMethod,
  currentReason,
  currentDescription,
  categories: initialCategories,
  frequentCategoryIds,
  reasonSuggestions,
}: {
  transactionId: string;
  kind: TransactionKind;
  currentDate: string;
  currentCategoryId: string;
  currentPaymentMethod: PaymentMethod | null;
  currentReason: string | null;
  currentDescription: string | null;
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
          <DialogDescription>La cuenta y el monto no se pueden modificar.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-tx-date">Fecha</Label>
            <Input id="edit-tx-date" name="date" type="date" defaultValue={currentDate} required />
          </div>

          {kind === "EXPENSE" && (
            <PaymentMethodSelect id="edit-tx-payment-method" defaultValue={currentPaymentMethod} />
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
