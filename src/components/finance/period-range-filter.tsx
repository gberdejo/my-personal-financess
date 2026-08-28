"use client";

import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getCustomRange, getPresetLabel, PERIOD_PRESETS, type PeriodPreset } from "@/lib/period";

export type PeriodSelection = {
  preset: PeriodPreset;
  customStart: string;
  customEnd: string;
};

export function PeriodRangeFilter({
  value,
  onApply,
}: {
  value: PeriodSelection;
  onApply: (next: PeriodSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PeriodSelection>(value);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setDraft(value);
  }

  function handleApply() {
    onApply(draft);
    setOpen(false);
  }

  const canApply = draft.preset !== "custom" || getCustomRange(draft.customStart, draft.customEnd) !== null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start gap-2 font-normal">
          <Calendar className="size-4 text-muted-foreground" />
          {getPresetLabel(value.preset, value.customStart, value.customEnd)}
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex">
          <div className="flex w-44 flex-col gap-0.5 border-r p-1">
            {PERIOD_PRESETS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, preset: item.value }))}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                  draft.preset === item.value && "bg-accent font-medium text-accent-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex w-60 flex-col gap-3 p-3">
            {draft.preset === "custom" ? (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Fecha inicial
                  <Input
                    type="date"
                    value={draft.customStart}
                    max={draft.customEnd}
                    onChange={(e) => setDraft((prev) => ({ ...prev, customStart: e.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Fecha final
                  <Input
                    type="date"
                    value={draft.customEnd}
                    min={draft.customStart}
                    onChange={(e) => setDraft((prev) => ({ ...prev, customEnd: e.target.value }))}
                  />
                </label>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {getPresetLabel(draft.preset, draft.customStart, draft.customEnd)}
              </p>
            )}
            <div className="mt-auto flex items-center justify-end gap-2 border-t pt-3">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" disabled={!canApply} onClick={handleApply}>
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
