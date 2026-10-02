"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
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
import { saveBudgetItem } from "@/features/budgets/actions";
import { formatCurrency } from "@/lib/format";

type CategoryOption = { id: string; name: string };
type ItemValues = {
  id: string;
  description: string;
  categoryId: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
};

export function BudgetItemDialog({
  budgetId,
  categories,
  item,
}: {
  budgetId: string;
  categories: CategoryOption[];
  item?: ItemValues;
}) {
  const isEdit = Boolean(item);
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [useQuantity, setUseQuantity] = useState(item?.quantity != null);
  const [quantity, setQuantity] = useState(item?.quantity?.toString() ?? "1");
  const [unitPrice, setUnitPrice] = useState(item?.unitPrice?.toString() ?? "");
  const [state, formAction, pending] = useActionState(
    saveBudgetItem.bind(null, budgetId, item?.id ?? null),
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
      if (!isEdit) {
        formRef.current?.reset();
        setCategoryId("");
        setUseQuantity(false);
        setQuantity("1");
        setUnitPrice("");
      }
    }
    wasPending.current = pending;
  }, [pending, state, isEdit]);

  const subtotal = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
            <Pencil className="size-3.5" />
            <span className="sr-only">Editar gasto</span>
          </Button>
        ) : (
          <Button variant="outline">
            <Plus />
            Agregar gasto
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar gasto planificado" : "Nuevo gasto planificado"}</DialogTitle>
          <DialogDescription>
            Sin fecha: se registra como gasto real recién cuando lo aplicás.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="item-description">Descripción</Label>
            <Input
              id="item-description"
              name="description"
              placeholder="Ej. Torta de chocolate"
              defaultValue={item?.description}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="item-category">Categoría</Label>
            <Select name="categoryId" value={categoryId} onValueChange={setCategoryId} required>
              <SelectTrigger id="item-category" className="w-full">
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

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="useQuantity"
              checked={useQuantity}
              onChange={(e) => setUseQuantity(e.target.checked)}
              className="size-4 accent-primary"
            />
            Calcular con cantidad × precio unitario
          </label>

          {useQuantity ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-quantity">Cantidad</Label>
                  <Input
                    id="item-quantity"
                    name="quantity"
                    type="number"
                    step="0.01"
                    min="0.01"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-unit-price">Precio unitario (S/)</Label>
                  <Input
                    id="item-unit-price"
                    name="unitPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    required
                  />
                </div>
              </div>
              <p className="text-right text-sm text-muted-foreground">
                Subtotal <span className="font-semibold text-foreground tabular-nums">{formatCurrency(subtotal)}</span>
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="item-amount">Monto estimado (S/)</Label>
              <Input
                id="item-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                defaultValue={item && item.amount > 0 ? item.amount : undefined}
                placeholder="0.00"
              />
            </div>
          )}

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
