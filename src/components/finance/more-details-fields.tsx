"use client";

import { useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReceiptLinksField } from "@/components/finance/receipt-links-field";
import { parseReceiptUrls } from "@/lib/receipts";

// Descripción y comprobantes plegados detrás de "Más detalles". Al plegarse siguen
// montados (ocultos) para que `description` y `receiptUrls` se envíen igual.
export function MoreDetailsFields({
  idPrefix,
  defaultDescription = null,
  defaultReceiptUrls = [],
  descriptionPlaceholder,
}: {
  idPrefix: string;
  defaultDescription?: string | null;
  defaultReceiptUrls?: string[];
  descriptionPlaceholder?: string;
}) {
  const hasInitial = !!defaultDescription?.trim() || defaultReceiptUrls.length > 0;
  const [open, setOpen] = useState(hasInitial);
  const [filled, setFilled] = useState({ description: !!defaultDescription?.trim(), receipts: defaultReceiptUrls.length });
  const ref = useRef<HTMLDivElement>(null);

  // Lee lo escrito para mostrarlo en el botón cuando está plegado.
  function handleInput() {
    const description = ref.current?.querySelector<HTMLTextAreaElement>('textarea[name="description"]')?.value ?? "";
    const receipts = ref.current?.querySelector<HTMLTextAreaElement>('textarea[name="receiptUrls"]')?.value ?? "";
    setFilled({ description: description.trim() !== "", receipts: parseReceiptUrls(receipts).urls.length });
  }

  const summary = [
    filled.description ? "descripción" : null,
    filled.receipts > 0 ? `${filled.receipts} ${filled.receipts === 1 ? "comprobante" : "comprobantes"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="w-fit text-sm font-medium text-primary hover:underline"
      >
        {open ? "− Menos detalles" : `+ Más detalles${summary ? ` (${summary})` : ""}`}
      </button>
      <div ref={ref} onInput={handleInput} className={open ? "flex flex-col gap-3" : "hidden"}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-description`} className="text-xs text-muted-foreground">
            Descripción (opcional)
          </Label>
          <Textarea
            id={`${idPrefix}-description`}
            name="description"
            defaultValue={defaultDescription ?? undefined}
            placeholder={descriptionPlaceholder}
            rows={2}
          />
        </div>
        <ReceiptLinksField id={`${idPrefix}-receipts`} defaultValue={defaultReceiptUrls} />
      </div>
    </div>
  );
}
