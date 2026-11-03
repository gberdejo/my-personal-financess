"use client";

import { useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { receiptLabel, receiptPreview } from "@/lib/receipts";
import { cn } from "@/lib/utils";

// Miniatura de un comprobante. Si no carga (archivo privado en Drive o link que
// no es imagen), queda un ícono con el link.
function ReceiptThumbnail({ url, className }: { url: string; className?: string }) {
  const preview = receiptPreview(url);
  const [failed, setFailed] = useState(false);
  const src = preview.kind === "drive" ? preview.thumbnail : preview.kind === "image" ? preview.src : null;

  return (
    <div className={cn("flex items-center justify-center overflow-hidden rounded-md border bg-muted", className)}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura de un sitio externo (Drive)
        <img
          src={src}
          alt="Comprobante"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex flex-col items-center gap-1 p-2 text-center text-[11px] text-muted-foreground">
          <FileText className="size-5" />
          <span className="line-clamp-2 break-all">{receiptLabel(url)}</span>
        </div>
      )}
    </div>
  );
}

// Miniaturas que abren el comprobante en otra pestaña (en los formularios).
export function ReceiptThumbnails({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="grid grid-cols-4 gap-2">
      {urls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" title={url}>
          <ReceiptThumbnail url={url} className="aspect-square" />
        </a>
      ))}
    </div>
  );
}

// Visor: el comprobante elegido en grande (en Drive, su vista previa en un
// iframe) y las miniaturas para cambiar entre ellos.
export function ReceiptGallery({ urls }: { urls: string[] }) {
  const [index, setIndex] = useState(0);
  const current = urls[Math.min(index, urls.length - 1)];
  if (!current) return null;
  const preview = receiptPreview(current);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border bg-muted">
        {preview.kind === "drive" ? (
          <iframe
            key={preview.embed}
            src={preview.embed}
            title="Comprobante"
            allow="autoplay"
            className="h-[60vh] w-full"
          />
        ) : preview.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagen de un sitio externo
          <img src={preview.src} alt="Comprobante" className="max-h-[60vh] w-full object-contain" />
        ) : (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <FileText className="size-6" />
            Este link no tiene vista previa.
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {preview.kind === "drive" &&
            "Si no se ve, compartí el archivo en Drive como «Cualquier persona con el enlace»."}
        </span>
        <a
          href={preview.open}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 font-medium text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" />
          {preview.kind === "drive" ? "Abrir en Drive" : "Abrir link"}
        </a>
      </div>
      {urls.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {urls.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setIndex(i)}
              className={cn("rounded-md outline-none", i === index && "ring-2 ring-primary")}
            >
              <ReceiptThumbnail url={url} className="aspect-square" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
