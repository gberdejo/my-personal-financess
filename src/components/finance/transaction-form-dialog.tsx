"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
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
import { createCategory } from "@/features/categories/actions";
import { createTransaction } from "@/features/transactions/actions";
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
}: {
  accounts: AccountOption[];
  incomeCategories: CategoryOption[];
  expenseCategories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TransactionKind>("EXPENSE");
  const [categories, setCategories] = useState({ INCOME: incomeCategories, EXPENSE: expenseCategories });
  const [categoryId, setCategoryId] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState(createTransaction, null);
  const [categoryPending, startCategoryTransition] = useTransition();

  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
      formRef.current?.reset();
      setKind("EXPENSE");
      setCategoryId("");
      setAddingCategory(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    const formData = new FormData();
    formData.set("name", newCategoryName.trim());
    formData.set("kind", kind);
    setCategoryError(null);
    startCategoryTransition(async () => {
      const result = await createCategory(null, formData);
      if (result?.error) {
        setCategoryError(result.error);
        return;
      }
      if (result?.category) {
        const created = result.category;
        setCategories((prev) => ({ ...prev, [created.kind]: [...prev[created.kind], created] }));
        setCategoryId(created.id);
        setNewCategoryName("");
        setAddingCategory(false);
      }
    });
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
              setAddingCategory(false);
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="EXPENSE">Gasto</TabsTrigger>
              <TabsTrigger value="INCOME">Ingreso</TabsTrigger>
            </TabsList>
          </Tabs>

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

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tx-category">Categoría</Label>
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setAddingCategory((v) => !v)}
              >
                {addingCategory ? "Cancelar" : "+ Nueva categoría"}
              </button>
            </div>
            {addingCategory ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="Nombre de la categoría"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
                <Button type="button" variant="secondary" disabled={categoryPending} onClick={handleAddCategory}>
                  Agregar
                </Button>
              </div>
            ) : (
              <Select name="categoryId" value={categoryId} onValueChange={setCategoryId} required>
                <SelectTrigger id="tx-category" className="w-full">
                  <SelectValue placeholder="Elegí una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {currentCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {categoryError && <p className="text-sm text-destructive">{categoryError}</p>}
          </div>

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
            <Textarea id="tx-description" name="description" placeholder="Ej. Almuerzo con el equipo" rows={2} />
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
