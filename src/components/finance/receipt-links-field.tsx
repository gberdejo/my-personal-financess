"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReceiptThumbnails } from "@/components/finance/receipt-gallery";
import { parseReceiptUrls, receiptUrlsError } from "@/lib/receipts";

// Links a comprobantes (uno por línea), con su vista previa. Se envía como `receiptUrls`.
export function ReceiptLinksField({ id, defaultValue = [] }: { id: string; defaultValue?: string[] }) {
  const [text, setText] = useState(defaultValue.join("\n"));
  const parsed = parseReceiptUrls(text);
  const error = receiptUrlsError(parsed);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Comprobantes (opcional)</Label>
      <Textarea
        id={id}
        name="receiptUrls"
        rows={2}
        placeholder="Pegá el link de Google Drive (uno por línea)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="text-xs"
      />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Para ver la vista previa, compartí el archivo en Drive como «Cualquier persona con el enlace».
        </p>
      )}
      <ReceiptThumbnails urls={parsed.urls} />
    </div>
  );
}
