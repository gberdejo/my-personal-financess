"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryCombobox } from "@/components/finance/category-combobox";
import { ReasonCombobox } from "@/components/finance/reason-combobox";
import { useCreateCategory } from "@/components/finance/use-create-category";
import { applyMovements, linkMovement, setMovementsDiscarded } from "@/features/imports/actions";
import type { ReasonSuggestion } from "@/features/categories/queries";
import type { ImportedMovementRow } from "@/features/imports/queries";
import type { TransactionKind } from "@/generated/prisma/client";
import { formatCurrency, formatDate, formatLimaTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { normalizeReason } from "@/lib/reason";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };
// `saveReason`: el motivo se escribió nuevo; al aplicar se guarda como sugerencia de la categoría.
type Draft = { categoryId: string; reason: string; saveReason: boolean; accountId: string };

// Movimientos pendientes de una importación: se eligen, se les pone categoría,
// motivo y cuenta, y se aplican como transacciones (o se descartan).
export function ImportedMovementsTable({
  importId,
  movements,
  accounts,
  defaultAccountId,
  incomeCategories,
  expenseCategories,
  frequentCategoryIds,
  reasonSuggestions,
}: {
  importId: string;
  movements: ImportedMovementRow[];
  accounts: Option[];
  defaultAccountId: string | null;
  incomeCategories: Option[];
  expenseCategories: Option[];
  frequentCategoryIds: string[];
  reasonSuggestions: Record<string, ReasonSuggestion[]>;
}) {
  const [categories, setCategories] = useState({ INCOME: incomeCategories, EXPENSE: expenseCategories });
  // Lo editado en cada fila; las que no se tocaron usan la sugerencia.
  const [edited, setEdited] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Movimiento al que se le asigna la categoría que se cree desde el buscador (o "bulk").
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [state, formAction, applying] = useActionState(applyMovements.bind(null, importId), null);
  const [discarding, startDiscard] = useTransition();

  const {
    create: createCategory,
    pending: categoryPending,
    error: categoryError,
  } = useCreateCategory((created) => {
    setCategories((prev) => ({ ...prev, [created.kind]: [...prev[created.kind], created] }));
    if (creatingFor === "bulk") assignToSelected(created.id);
    else if (creatingFor) update(creatingFor, { categoryId: created.id });
    // Las demás filas cuyo archivo traía esa misma categoría (que no existía) también la usan.
    const key = normalizeReason(created.name);
    for (const m of movements) {
      if (m.kind === created.kind && m.missingCategory && normalizeReason(m.missingCategory) === key) {
        update(m.id, { categoryId: created.id });
      }
    }
  });

  const suggested = useMemo(
    () =>
      Object.fromEntries(
        movements.map((m): [string, Draft] => [
          m.id,
          {
            categoryId: m.suggestion.categoryId ?? "",
            reason: m.suggestion.reason,
            saveReason: false,
            accountId: defaultAccountId ?? "",
          },
        ])
      ),
    [movements, defaultAccountId]
  );
  const drafts: Record<string, Draft> = { ...suggested, ...edited };

  // Solo los que siguen pendientes (al aplicar, la página se recarga sin ellos).
  const chosen = movements.filter((m) => selected.has(m.id));
  const chosenKinds = new Set(chosen.map((m) => m.kind));
  const bulkKind: TransactionKind | null = chosenKinds.size === 1 ? chosen[0].kind : null;
  const missingCategory = chosen.filter((m) => !drafts[m.id]?.categoryId).length;
  const total = chosen.reduce((sum, m) => sum + (m.kind === "INCOME" ? m.amount : -m.amount), 0);
  const items = chosen.map((m) => ({ id: m.id, ...drafts[m.id] }));

  function update(id: string, patch: Partial<Draft>) {
    setEdited((prev) => ({ ...prev, [id]: { ...(prev[id] ?? suggested[id]), ...patch } }));
  }

  function assignToSelected(categoryId: string, reason?: string) {
    setEdited((prev) => {
      const next = { ...prev };
      for (const m of chosen) {
        next[m.id] = { ...(next[m.id] ?? suggested[m.id]), categoryId, ...(reason ? { reason, saveReason: false } : {}) };
      }
      return next;
    });
  }

  function toggle(id: string, value: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const allSelected = movements.length > 0 && chosen.length === movements.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2 backdrop-blur">
        <label className="flex items-center gap-2 px-1 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={allSelected}
            onChange={(e) => setSelected(e.target.checked ? new Set(movements.map((m) => m.id)) : new Set())}
          />
          {chosen.length > 0 ? `${chosen.length} seleccionados` : "Seleccionar todos"}
        </label>
        {chosen.length > 0 && (
          <span className={cn("text-sm font-medium tabular-nums", total < 0 ? "text-expense" : "text-income")}>
            {formatCurrency(total)}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {chosen.length > 0 &&
            (bulkKind ? (
              <div className="w-56">
                <CategoryCombobox
                  id="bulk-category"
                  categories={categories[bulkKind]}
                  value=""
                  frequentIds={frequentCategoryIds}
                  reasonSuggestions={reasonSuggestions}
                  creating={categoryPending && creatingFor === "bulk"}
                  onSelect={(categoryId, reason) => assignToSelected(categoryId, reason)}
                  onCreate={(name) => {
                    setCreatingFor("bulk");
                    createCategory(name, bulkKind);
                  }}
                />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Para poner una categoría a todos, elegí solo gastos o solo ingresos.
              </span>
            ))}
          <Button
            variant="outline"
            disabled={chosen.length === 0 || discarding}
            onClick={() =>
              startDiscard(async () => {
                await setMovementsDiscarded(
                  importId,
                  chosen.map((m) => m.id),
                  true
                );
                setSelected(new Set());
              })
            }
          >
            Descartar
          </Button>
          <form action={formAction}>
            <input type="hidden" name="items" value={JSON.stringify(items)} />
            <Button type="submit" disabled={chosen.length === 0 || missingCategory > 0 || applying}>
              {applying ? "Aplicando…" : `Aplicar${chosen.length ? ` (${chosen.length})` : ""}`}
            </Button>
          </form>
        </div>
        {(missingCategory > 0 || state?.error || categoryError) && (
          <p className="w-full px-1 text-xs text-destructive">
            {state?.error ??
              categoryError ??
              `${missingCategory === 1 ? "Falta la categoría de 1 movimiento" : `Faltan las categorías de ${missingCategory} movimientos`}.`}
          </p>
        )}
      </div>

      <ul className="overflow-hidden rounded-xl border">
        {movements.map((m) => (
          <MovementRow
            key={m.id}
            movement={m}
            draft={drafts[m.id]}
            selected={selected.has(m.id)}
            categories={categories[m.kind]}
            accounts={accounts}
            frequentCategoryIds={frequentCategoryIds}
            reasonSuggestions={reasonSuggestions}
            creatingCategory={categoryPending && creatingFor === m.id}
            onToggle={(value) => toggle(m.id, value)}
            onChange={(patch) => update(m.id, patch)}
            onCreateCategory={(name) => {
              setCreatingFor(m.id);
              createCategory(name, m.kind);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function MovementRow({
  movement,
  draft,
  selected,
  categories,
  accounts,
  frequentCategoryIds,
  reasonSuggestions,
  creatingCategory,
  onToggle,
  onChange,
  onCreateCategory,
}: {
  movement: ImportedMovementRow;
  draft: Draft;
  selected: boolean;
  categories: Option[];
  accounts: Option[];
  frequentCategoryIds: string[];
  reasonSuggestions: Record<string, ReasonSuggestion[]>;
  creatingCategory: boolean;
  onToggle: (value: boolean) => void;
  onChange: (patch: Partial<Draft>) => void;
  onCreateCategory: (name: string) => void;
}) {
  const [linking, startLink] = useTransition();
  const income = movement.kind === "INCOME";

  return (
    <li
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-2 border-t px-3 py-3 first:border-t-0 md:grid-cols-[auto_7rem_1fr_6.5rem_13rem_11rem_10rem] md:items-center",
        selected && "bg-primary/5"
      )}
    >
      <input
        type="checkbox"
        aria-label="Seleccionar"
        className="mt-1 size-4 accent-primary md:mt-0"
        checked={selected}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <div className="hidden text-xs text-muted-foreground tabular-nums md:block">
        <p>{formatDate(movement.date)}</p>
        <p>{formatLimaTime(movement.occurredAt)}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {income ? "De " : "A "}
          {movement.counterparty ?? "—"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="md:hidden">
            {formatDate(movement.date)} {formatLimaTime(movement.occurredAt)}
            {movement.message ? " · " : ""}
          </span>
          {movement.message}
        </p>
        {movement.paymentMethod && (
          <p className="mt-0.5 text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[movement.paymentMethod]}</p>
        )}
        {movement.missingCategory && !draft.categoryId && (
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
            La categoría “{movement.missingCategory}” del archivo no existe.{" "}
            <button
              type="button"
              className="font-medium underline-offset-2 hover:underline"
              disabled={creatingCategory}
              onClick={() => onCreateCategory(movement.missingCategory!)}
            >
              Crearla
            </button>
          </p>
        )}
        {movement.alsoImportedAt && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Copy className="size-3" />
            Ya importado el {formatDate(movement.alsoImportedAt)}
          </p>
        )}
      </div>
      <span
        className={cn("text-right text-sm font-semibold tabular-nums", income ? "text-income" : "text-expense")}
      >
        {income ? "+" : "−"}
        {formatCurrency(movement.amount)}
      </span>

      <div className="col-span-3 md:col-span-1">
        <CategoryCombobox
          id={`category-${movement.id}`}
          categories={categories}
          value={draft.categoryId}
          frequentIds={frequentCategoryIds}
          reasonSuggestions={reasonSuggestions}
          creating={creatingCategory}
          onSelect={(categoryId, reason) => onChange(reason ? { categoryId, reason, saveReason: false } : { categoryId })}
          onCreate={onCreateCategory}
        />
      </div>
      <div className="col-span-3 md:col-span-1">
        <ReasonCombobox
          id={`reason-${movement.id}`}
          suggestions={reasonSuggestions[draft.categoryId] ?? []}
          value={draft.reason}
          onChange={(reason, isNew) => onChange({ reason, saveReason: isNew })}
        />
      </div>
      <div className="col-span-3 md:col-span-1">
        <Select value={draft.accountId} onValueChange={(accountId) => onChange({ accountId })}>
          <SelectTrigger aria-label="Cuenta" className="w-full">
            <SelectValue placeholder="Cuenta" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {movement.duplicates.length > 0 && (
        <div className="col-span-3 flex flex-col gap-1 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs md:col-span-7">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            Posible duplicado: ya hay {movement.duplicates.length === 1 ? "una transacción" : "transacciones"} con el
            mismo monto
          </p>
          {movement.duplicates.map((duplicate) => (
            <div key={duplicate.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">
                {formatDate(duplicate.date)} · {duplicate.categoryName}
                {duplicate.reason ? ` · ${duplicate.reason}` : ""} · {duplicate.accountName}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={linking}
                onClick={() => startLink(() => linkMovement(movement.id, duplicate.id))}
              >
                <Link2 />
                Es esta: vincular
              </Button>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
