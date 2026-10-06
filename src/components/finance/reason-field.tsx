"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeReason } from "@/lib/reason";
import { cn } from "@/lib/utils";
import type { ReasonSuggestion } from "@/features/categories/queries";

// Sin texto se muestran las primeras; al escribir, las que coinciden.
const MAX_VISIBLE = 10;

// Motivo en texto libre con sugerencias de la categoría elegida. Si se escribe
// uno nuevo, ofrece guardarlo (se envía `saveReason=on`).
export function ReasonField({
  id,
  suggestions,
  canSave,
  defaultValue = "",
}: {
  id: string;
  defaultValue?: string;
  suggestions: ReasonSuggestion[];
  // Solo con una categoría elegida tiene sentido guardar la sugerencia.
  canSave: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [save, setSave] = useState(true);

  const query = normalizeReason(value);
  const exactMatch = suggestions.some((s) => normalizeReason(s.name) === query);
  const visible = (
    query ? suggestions.filter((s) => normalizeReason(s.name).includes(query)) : suggestions
  ).slice(0, MAX_VISIBLE);
  const showSave = canSave && query !== "" && !exactMatch;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Motivo (opcional)</Label>
      <Input
        id={id}
        name="reason"
        placeholder="Ej. Almuerzo"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />

      {visible.length > 0 && !exactMatch && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Motivos sugeridos">
          {visible.map((suggestion) => (
            <button
              key={suggestion.name}
              type="button"
              onClick={() => setValue(suggestion.name)}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground",
                !suggestion.saved && "border-dashed text-muted-foreground",
              )}
              title={suggestion.saved ? undefined : "Usada antes en esta categoría"}
            >
              {!suggestion.saved && <History className="size-3" />}
              {suggestion.name}
            </button>
          ))}
        </div>
      )}

      {showSave && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            name="saveReason"
            checked={save}
            onChange={(e) => setSave(e.target.checked)}
            className="size-3.5 accent-primary"
          />
          Guardar “{value.trim()}” como sugerencia de la categoría
        </label>
      )}
    </div>
  );
}
