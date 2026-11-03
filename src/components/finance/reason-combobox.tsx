"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, History, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { normalizeReason } from "@/lib/reason";
import { cn } from "@/lib/utils";
import type { ReasonSuggestion } from "@/features/categories/queries";

type Option =
  | { type: "suggestion"; suggestion: ReasonSuggestion }
  | { type: "create"; name: string }
  | { type: "clear" };

// Sin tildes: "cafe" encuentra "Café".
function normalizeSearch(text: string) {
  return normalizeReason(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function buildOptions(query: string, suggestions: ReasonSuggestion[], value: string): Option[] {
  const q = normalizeSearch(query);
  const matches = q ? suggestions.filter((s) => normalizeSearch(s.name).includes(q)) : suggestions;
  const options: Option[] = matches.map((suggestion) => ({ type: "suggestion", suggestion }));
  if (q && !suggestions.some((s) => normalizeSearch(s.name) === q)) {
    options.push({ type: "create", name: query.trim().replace(/\s+/g, " ") });
  }
  if (!q && value) options.push({ type: "clear" });
  return options;
}

// Motivo con las sugerencias de la categoría elegida y búsqueda; si no está,
// se puede usar uno nuevo (`isNew` = true, para guardarlo como sugerencia).
export function ReasonCombobox({
  id,
  suggestions,
  value,
  onChange,
}: {
  id: string;
  suggestions: ReasonSuggestion[];
  value: string;
  onChange: (reason: string, isNew: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => buildOptions(query, suggestions, value), [query, suggestions, value]);
  const selectedKey = normalizeReason(value);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  function choose(option: Option) {
    if (option.type === "create") onChange(option.name, true);
    else if (option.type === "clear") onChange("", false);
    else onChange(option.suggestion.name, false);
    setOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value || "Motivo"}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
        <div className="flex items-center gap-2 border-b px-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar o escribir un motivo…"
            aria-label="Buscar motivo"
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1">
          {options.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {suggestions.length === 0 ? "Esta categoría no tiene motivos: escribí uno." : "Sin motivos."}
            </p>
          )}
          {options.map((option, index) => {
            const active = index === activeIndex;
            const key =
              option.type === "suggestion" ? `s-${option.suggestion.name}` : option.type === "create" ? "create" : "clear";
            return (
              <div key={key}>
                {option.type !== "suggestion" && index > 0 && <div className="-mx-1 my-1 h-px bg-border" />}
                <button
                  type="button"
                  role="option"
                  aria-selected={option.type === "suggestion" && normalizeReason(option.suggestion.name) === selectedKey}
                  data-index={index}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    active && "bg-accent text-accent-foreground"
                  )}
                >
                  {option.type === "create" && (
                    <>
                      <Plus className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        Nuevo motivo <span className="font-medium">“{option.name}”</span>
                      </span>
                    </>
                  )}
                  {option.type === "clear" && (
                    <>
                      <X className="size-4 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground">Sin motivo</span>
                    </>
                  )}
                  {option.type === "suggestion" && (
                    <>
                      {!option.suggestion.saved && (
                        <History className="size-3.5 shrink-0 text-muted-foreground" aria-label="Usado antes" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{option.suggestion.name}</span>
                      {normalizeReason(option.suggestion.name) === selectedKey && <Check className="size-4 shrink-0" />}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
