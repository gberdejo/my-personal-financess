"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ReasonSuggestion } from "@/features/categories/queries";

type CategoryOption = { id: string; name: string };

type Option =
  | { type: "category"; category: CategoryOption; section: string; via?: string }
  | { type: "create"; name: string };

const FREQUENT_SHOWN = 5;
// Coincidencias por motivo que se muestran, para no tapar la lista.
const REASON_MATCHES_SHOWN = 6;

// Sin tildes ni mayúsculas: "educacion" encuentra "Educación".
function normalizeSearch(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function buildOptions(
  query: string,
  categories: CategoryOption[],
  frequentIds: string[],
  reasonSuggestions: Record<string, ReasonSuggestion[]>
): Option[] {
  const q = normalizeSearch(query);

  if (!q) {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const frequent = frequentIds
      .map((id) => byId.get(id))
      .filter((c): c is CategoryOption => !!c)
      .slice(0, FREQUENT_SHOWN);
    const frequentSet = new Set(frequent.map((c) => c.id));
    return [
      ...frequent.map((category) => ({ type: "category" as const, category, section: "Frecuentes" })),
      ...categories
        .filter((c) => !frequentSet.has(c.id))
        .map((category) => ({
          type: "category" as const,
          category,
          section: frequent.length > 0 ? "Todas" : "",
        })),
    ];
  }

  // Primero las que empiezan con lo buscado, después las que lo contienen.
  const byName = categories
    .map((category) => ({ category, index: normalizeSearch(category.name).indexOf(q) }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => Number(a.index !== 0) - Number(b.index !== 0) || a.category.name.localeCompare(b.category.name));
  const matchedIds = new Set(byName.map((m) => m.category.id));

  const byReason: Option[] = [];
  for (const category of categories) {
    if (matchedIds.has(category.id)) continue;
    const reason = reasonSuggestions[category.id]?.find((r) => normalizeSearch(r.name).includes(q));
    if (reason) byReason.push({ type: "category", category, section: "Por motivo", via: reason.name });
  }

  const options: Option[] = [
    ...byName.map(({ category }) => ({ type: "category" as const, category, section: "" })),
    ...byReason.slice(0, REASON_MATCHES_SHOWN),
  ];

  const exactName = categories.some((c) => normalizeSearch(c.name) === q);
  if (!exactName) options.push({ type: "create", name: query.trim().replace(/\s+/g, " ") });

  return options;
}

// Selector de categoría con búsqueda por nombre y por sus motivos sugeridos. Si no existe, permite crearla desde el mismo buscador.
export function CategoryCombobox({
  id,
  categories,
  value,
  frequentIds,
  reasonSuggestions,
  creating,
  onSelect,
  onCreate,
}: {
  id: string;
  categories: CategoryOption[];
  value: string;
  frequentIds: string[];
  reasonSuggestions: Record<string, ReasonSuggestion[]>;
  creating: boolean;
  // `reason`: si se encontró por un motivo, para completarlo.
  onSelect: (categoryId: string, reason?: string) => void;
  onCreate: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const options = useMemo(
    () => buildOptions(query, categories, frequentIds, reasonSuggestions),
    [query, categories, frequentIds, reasonSuggestions]
  );
  const selected = categories.find((c) => c.id === value);

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
    if (option.type === "create") onCreate(option.name);
    else onSelect(option.category.id, option.via);
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
      // Sin esto, Enter enviaría el formulario del movimiento.
      e.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option);
    }
  }

  return (
    // `modal`: dentro de un Dialog, el bloqueo de scroll del diálogo impide
    // scrollear la lista (está en un portal fuera de él). Modal la habilita.
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={creating}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {creating ? "Creando categoría…" : (selected?.name ?? "Elegí una categoría")}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
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
            placeholder="Buscar categoría o motivo…"
            aria-label="Buscar categoría"
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1">
          {options.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Sin categorías.</p>}
          {options.map((option, index) => {
            const section = option.type === "category" ? option.section : "";
            const prev = options[index - 1];
            const showHeader = section && (!prev || prev.type !== "category" || prev.section !== section);
            const active = index === activeIndex;
            return (
              <div key={option.type === "create" ? "create" : `${option.section}-${option.category.id}`}>
                {showHeader && (
                  <p className="px-2 pt-2 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    {section}
                  </p>
                )}
                {option.type === "create" && index > 0 && <div className="-mx-1 my-1 h-px bg-border" />}
                <button
                  type="button"
                  role="option"
                  aria-selected={option.type === "category" && option.category.id === value}
                  data-index={index}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    active && "bg-accent text-accent-foreground"
                  )}
                >
                  {option.type === "create" ? (
                    <>
                      <Plus className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        Crear categoría <span className="font-medium">“{option.name}”</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate">
                        {option.category.name}
                        {option.via && <span className="text-muted-foreground"> · {option.via}</span>}
                      </span>
                      {option.category.id === value && <Check className="size-4 shrink-0" />}
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
