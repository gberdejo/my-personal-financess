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
import { Textarea } from "@/components/ui/textarea";
import { createBudget, updateBudget } from "@/features/budgets/actions";
import { BUDGET_TEMPLATES, BUDGET_TEMPLATE_ITEMS } from "@/features/budgets/templates";
import { BUDGET_TEMPLATE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { BudgetTemplate } from "@/generated/prisma/client";

type AccountOption = { id: string; name: string };

// Radix Select no admite value="" en un ítem.
const NO_ACCOUNT = "none";

export function BudgetFormDialog({
  accounts,
  budget,
}: {
  accounts: AccountOption[];
  budget?: { id: string; title: string; description: string | null; date: string; accountId: string | null };
}) {
  const isEdit = Boolean(budget);
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<BudgetTemplate>("PARTY");
  const [accountId, setAccountId] = useState(budget?.accountId ?? NO_ACCOUNT);
  const [state, formAction, pending] = useActionState(
    budget ? updateBudget.bind(null, budget.id) : createBudget,
    null
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  const templateItems = BUDGET_TEMPLATE_ITEMS[template];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Pencil className="size-4" />
            <span className="sr-only">Editar presupuesto</span>
          </Button>
        ) : (
          <Button>
            <Plus />
            Nuevo presupuesto
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar presupuesto" : "Nuevo presupuesto"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cambiá los datos generales. Los gastos se editan desde la lista."
              : "Para una fiesta, una obra o unas compras que vas a hacer más adelante."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="template" value={template} />
          <input type="hidden" name="accountId" value={accountId === NO_ACCOUNT ? "" : accountId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="budget-title">Título</Label>
            <Input
              id="budget-title"
              name="title"
              placeholder="Ej. Cumpleaños de Sofía"
              defaultValue={budget?.title}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="budget-date">
                Fecha <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input id="budget-date" name="date" type="date" defaultValue={budget?.date} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="budget-account">Cuenta por defecto</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="budget-account" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ACCOUNT}>Elegir al aplicar</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="budget-description">
              Detalle <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="budget-description"
              name="description"
              placeholder="Ej. Fiesta en casa, unos 30 invitados"
              defaultValue={budget?.description ?? undefined}
              rows={2}
            />
          </div>

          {!isEdit && (
            <div className="flex flex-col gap-2">
              <Label id="budget-template-label">Plantilla</Label>
              <div role="radiogroup" aria-labelledby="budget-template-label" className="grid grid-cols-3 gap-2">
                {BUDGET_TEMPLATES.map((value) => {
                  const count = BUDGET_TEMPLATE_ITEMS[value].length;
                  const selected = value === template;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTemplate(value)}
                      className={cn(
                        "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        selected ? "border-primary bg-primary/10" : "hover:bg-muted"
                      )}
                    >
                      <span className="text-sm font-medium">{BUDGET_TEMPLATE_LABELS[value]}</span>
                      <span className="text-xs text-muted-foreground">
                        {count > 0 ? `${count} gastos sugeridos` : "Lista vacía"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {templateItems.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Agrega {templateItems.map((item) => item.description.toLowerCase()).join(", ")}. Llegan con monto 0
                  para que completes o borres lo que no uses.
                </p>
              )}
            </div>
          )}

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar" : "Crear presupuesto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
