"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/labels";
import type { PaymentMethod } from "@/generated/prisma/client";

type Option = { id: string; name: string };

export type LoanInfoValues = {
  name: string;
  lender: string;
  categoryId: string;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
};

// Radix Select no admite value="" en un ítem.
const NONE = "none";

// Se envían como name, lender, categoryId, accountId y paymentMethod.
export function LoanInfoFields({
  values,
  onChange,
  accounts,
  categories,
}: {
  values: LoanInfoValues;
  onChange: (values: LoanInfoValues) => void;
  accounts: Option[];
  categories: Option[];
}) {
  function set<K extends keyof LoanInfoValues>(field: K, value: LoanInfoValues[K]) {
    onChange({ ...values, [field]: value });
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="loan-name">Nombre</Label>
          <Input
            id="loan-name"
            name="name"
            placeholder="Ej. Préstamo hipotecario"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="loan-lender">Entidad (opcional)</Label>
          <Input
            id="loan-lender"
            name="lender"
            placeholder="Banco, financiera o persona"
            value={values.lender}
            onChange={(e) => set("lender", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="loan-category">Categoría del gasto</Label>
          <Select name="categoryId" value={values.categoryId} onValueChange={(v) => set("categoryId", v)} required>
            <SelectTrigger id="loan-category" className="w-full">
              <SelectValue placeholder="Elegí una categoría" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="loan-account">Cuenta de cargo</Label>
          <Select value={values.accountId ?? NONE} onValueChange={(v) => set("accountId", v === NONE ? null : v)}>
            <SelectTrigger id="loan-account" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin definir</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="accountId" value={values.accountId ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="loan-method">Método de pago</Label>
          <Select
            value={values.paymentMethod ?? NONE}
            onValueChange={(v) => set("paymentMethod", v === NONE ? null : (v as PaymentMethod))}
          >
            <SelectTrigger id="loan-method" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin definir</SelectItem>
              {PAYMENT_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="paymentMethod" value={values.paymentMethod ?? ""} />
        </div>
      </div>
    </>
  );
}
