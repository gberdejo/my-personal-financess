"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CategoryCombobox } from "@/components/finance/category-combobox";
import { ReasonField } from "@/components/finance/reason-field";
import { useCreateCategory } from "@/components/finance/use-create-category";
import { PaymentMethodSelect } from "@/components/finance/payment-method-select";
import { createTransaction } from "@/features/transactions/actions";
import type { ReasonSuggestion } from "@/features/categories/queries";
import type { TransactionKind } from "@/generated/prisma/client";

type CategoryOption = { id: string; name: string };
type AccountOption = { id: string; name: string };

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function TransactionFormDialog({
  accounts,
  incomeCategories,
  expenseCategories,
  frequentCategoryIds,
  reasonSuggestions,
}: {
  accounts: AccountOption[];
  incomeCategories: CategoryOption[];
  expenseCategories: CategoryOption[];
  frequentCategoryIds: string[];
  // Por id de categoría.
  reasonSuggestions: Record<string, ReasonSuggestion[]>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TransactionKind>("EXPENSE");
  const [categories, setCategories] = useState({ INCOME: incomeCategories, EXPENSE: expenseCategories });
  const [categoryId, setCategoryId] = useState("");
  // Motivo a completar al elegir la categoría por uno de sus motivos.
  // `key` remonta el campo para que tome el valor nuevo.
  const [reasonPrefill, setReasonPrefill] = useState({ key: 0, value: "" });

  const [state, formAction, pending] = useActionState(createTransaction, null);
  const {
    create: createCategory,
    pending: categoryPending,
    error: categoryError,
    setError: setCategoryError,
  } = useCreateCategory((created) => {
    setCategories((prev) => ({ ...prev, [created.kind]: [...prev[created.kind], created] }));
    setCategoryId(created.id);
  });

  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
      formRef.current?.reset();
      setKind("EXPENSE");
      setCategoryId("");
      setCategoryError(null);
    }
    wasPending.current = pending;
  }, [pending, state, setCategoryError]);

  function handleSelectCategory(id: string, reason?: string) {
    setCategoryId(id);
    setCategoryError(null);
    if (reason) setReasonPrefill((prev) => ({ key: prev.key + 1, value: reason }));
  }

  const currentCategories = categories[kind];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Agregar movimiento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo movimiento</DialogTitle>
          <DialogDescription>Registrá un ingreso o un gasto.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="kind" value={kind} />
          <Tabs
            value={kind}
            onValueChange={(value) => {
              setKind(value as TransactionKind);
              setCategoryId("");
              setCategoryError(null);
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="EXPENSE">Gasto</TabsTrigger>
              <TabsTrigger value="INCOME">Ingreso</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className={kind === "EXPENSE" ? "grid grid-cols-2 gap-4" : "flex flex-col"}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-account">Cuenta</Label>
              <Select name="accountId" required>
                <SelectTrigger id="tx-account" className="w-full">
                  <SelectValue placeholder="Elegí una cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accounts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Primero creá una cuenta en la sección Cuentas.
                </p>
              )}
            </div>
            {kind === "EXPENSE" && <PaymentMethodSelect id="tx-payment-method" />}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tx-category">Categoría</Label>
            <input type="hidden" name="categoryId" value={categoryId} />
            <CategoryCombobox
              id="tx-category"
              categories={currentCategories}
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
            id="tx-reason"
            defaultValue={reasonPrefill.value}
            suggestions={reasonSuggestions[categoryId] ?? []}
            canSave={categoryId !== ""}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-amount">Monto (S/)</Label>
              <Input
                id="tx-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-date">Fecha</Label>
              <Input id="tx-date" name="date" type="date" defaultValue={today()} required />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tx-description">Descripción (opcional)</Label>
            <Textarea
              id="tx-description"
              name="description"
              placeholder="Ej. Con el equipo por el cumpleaños de Ana"
              rows={2}
            />
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending || accounts.length === 0}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
