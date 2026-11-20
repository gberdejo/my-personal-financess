"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryCombobox } from "@/components/finance/category-combobox";
import { ReasonField } from "@/components/finance/reason-field";
import { useCreateCategory } from "@/components/finance/use-create-category";
import { PaymentMethodSelect } from "@/components/finance/payment-method-select";
import { AmountInput } from "@/components/finance/amount-input";
import { CompactDateField } from "@/components/finance/compact-date-field";
import { MoreDetailsFields } from "@/components/finance/more-details-fields";
import { ResponsiveFormDialog } from "@/components/finance/responsive-form-dialog";
import {
  ChargeCurrencyHint,
  ChargeCurrencyToggle,
  type ChargeCurrency,
} from "@/components/finance/charge-currency-field";
import { createTransaction } from "@/features/transactions/actions";
import type { ReasonSuggestion } from "@/features/categories/queries";
import { todayInLima, toUTCDateInputValue } from "@/lib/date";
import type { MovementKind } from "@/lib/labels";
import type { PaymentMethod } from "@/generated/prisma/client";

type CategoryOption = { id: string; name: string };
type AccountOption = { id: string; name: string };

export function TransactionFormDialog({
  accounts,
  incomeCategories,
  expenseCategories,
  frequentCategoryIds,
  reasonSuggestions,
  defaultPaymentMethod = null,
  defaultCardId = null,
}: {
  accounts: AccountOption[];
  incomeCategories: CategoryOption[];
  expenseCategories: CategoryOption[];
  frequentCategoryIds: string[];
  // Por id de categoría.
  reasonSuggestions: Record<string, ReasonSuggestion[]>;
  // Método (y tarjeta) del filtro de Transacciones: el gasto nuevo arranca con ese método.
  defaultPaymentMethod?: PaymentMethod | null;
  defaultCardId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MovementKind>("EXPENSE");
  const [categories, setCategories] = useState({ INCOME: incomeCategories, EXPENSE: expenseCategories });
  const [categoryId, setCategoryId] = useState("");
  // Motivo a completar al elegir la categoría por uno de sus motivos.
  // `key` remonta el campo para que tome el valor nuevo.
  const [reasonPrefill, setReasonPrefill] = useState({ key: 0, value: "" });
  // Con tarjeta de crédito el gasto es un consumo: no pide cuenta.
  const [method, setMethod] = useState<PaymentMethod | null>(defaultPaymentMethod);
  // Remonta el método de pago al limpiar el formulario.
  const [methodKey, setMethodKey] = useState(0);
  // Un consumo con tarjeta puede ser en dólares; el monto se controla para estimar los soles.
  const [currency, setCurrency] = useState<ChargeCurrency>("PEN");
  const [amount, setAmount] = useState("");

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
      setMethod(defaultPaymentMethod);
      setMethodKey((key) => key + 1);
      setCurrency("PEN");
      setAmount("");
      setCategoryId("");
      setCategoryError(null);
    }
    wasPending.current = pending;
  }, [pending, state, setCategoryError, defaultPaymentMethod]);

  // El contenido del modal se desmonta al cerrarse: al abrirlo, el método vuelve al del filtro
  // para que coincida con lo que muestra el selector.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setMethod(defaultPaymentMethod);
      setCurrency("PEN");
    }
  }

  function handleSelectCategory(id: string, reason?: string) {
    setCategoryId(id);
    setCategoryError(null);
    if (reason) setReasonPrefill((prev) => ({ key: prev.key + 1, value: reason }));
  }

  const currentCategories = categories[kind];
  const isCharge = kind === "EXPENSE" && method === "CREDIT_CARD";
  const isUsd = isCharge && currency === "USD";

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button>
          <Plus />
          Agregar movimiento
        </Button>
      }
      title="Nuevo movimiento"
      description="Registrá un ingreso o un gasto."
      action={formAction}
      formRef={formRef}
      footer={
        <Button type="submit" disabled={pending || accounts.length === 0}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      }
    >
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={kind}
          onValueChange={(value) => {
            setKind(value as MovementKind);
            // Al volver a Gasto el selector se monta de nuevo con el método del filtro.
            setMethod(defaultPaymentMethod);
            setCategoryId("");
            setCategoryError(null);
          }}
        >
          <TabsList>
            <TabsTrigger value="EXPENSE">Gasto</TabsTrigger>
            <TabsTrigger value="INCOME">Ingreso</TabsTrigger>
          </TabsList>
        </Tabs>
        <AmountInput id="tx-amount" prefix={isUsd ? "US$" : "S/"} value={amount} onChange={setAmount} />
        {isCharge && <ChargeCurrencyToggle currency={currency} onCurrencyChange={setCurrency} />}
      </div>
      {isCharge && <ChargeCurrencyHint currency={currency} amount={amount} />}

      <div className="grid grid-cols-2 gap-3">
        {kind === "EXPENSE" && (
          <PaymentMethodSelect
            key={methodKey}
            id="tx-payment-method"
            compact
            defaultValue={defaultPaymentMethod}
            defaultCardId={defaultCardId}
            onMethodChange={setMethod}
          />
        )}
        <div className="order-2">
          <CompactDateField id="tx-date" defaultValue={toUTCDateInputValue(todayInLima())} />
        </div>
        {!isCharge && (
          <div className={`flex flex-col gap-1.5 ${kind === "EXPENSE" ? "order-3 col-span-2" : "order-1"}`}>
            <Label htmlFor="tx-account" className="text-xs text-muted-foreground">
              Cuenta
            </Label>
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
              <p className="text-xs text-muted-foreground">Primero creá una cuenta en la sección Cuentas.</p>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="tx-category" className="text-xs text-muted-foreground">
            Categoría
          </Label>
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
      </div>

      <MoreDetailsFields idPrefix="tx" descriptionPlaceholder="Ej. Con el equipo por el cumpleaños de Ana" />

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </ResponsiveFormDialog>
  );
}
