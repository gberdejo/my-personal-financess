"use client";

import { useState, useTransition } from "react";
import { createCategory } from "@/features/categories/actions";
import type { TransactionKind } from "@/generated/prisma/client";

type CreatedCategory = { id: string; name: string; kind: TransactionKind };

// Crea una categoría desde el buscador de categorías de un formulario.
export function useCreateCategory(onCreated: (category: CreatedCategory) => void) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create(name: string, kind: TransactionKind) {
    if (!name) return;
    const formData = new FormData();
    formData.set("name", name);
    formData.set("kind", kind);
    setError(null);
    startTransition(async () => {
      const result = await createCategory(null, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.category) onCreated(result.category);
    });
  }

  return { create, pending, error, setError };
}
