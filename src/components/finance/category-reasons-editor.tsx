"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCategoryReason, deleteCategoryReason } from "@/features/categories/actions";

type Reason = { id: string; name: string; userId: string | null };

export function CategoryReasonsEditor({
  categoryId,
  reasons,
}: {
  categoryId: string;
  // userId null = predefinido (no se puede borrar).
  reasons: Reason[];
}) {
  const [state, formAction, pending] = useActionState(createCategoryReason.bind(null, categoryId), null);
  const [deleting, startDelete] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <div className="flex flex-col gap-3">
      {reasons.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin motivos sugeridos.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label="Motivos sugeridos">
          {reasons.map((reason) => (
            <li
              key={reason.id}
              className="inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs has-[button]:pr-1"
            >
              {reason.name}
              {reason.userId && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => startDelete(() => deleteCategoryReason(reason.id))}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <X className="size-3" />
                  <span className="sr-only">Quitar {reason.name}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} action={formAction} className="flex gap-2">
        <Input name="name" placeholder="Nuevo motivo" autoComplete="off" required className="h-7 text-xs" />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          <Plus />
          Agregar
        </Button>
      </form>
      {state?.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
