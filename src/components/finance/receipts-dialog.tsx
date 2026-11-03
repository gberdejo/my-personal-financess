"use client";

import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ReceiptGallery } from "@/components/finance/receipt-gallery";

// Clip con la cantidad de comprobantes; abre el visor.
export function ReceiptsDialog({ urls, title }: { urls: string[]; title?: string }) {
  if (urls.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-muted-foreground">
          <Paperclip className="size-3.5" />
          <span className="text-xs tabular-nums">{urls.length}</span>
          <span className="sr-only">Ver comprobantes</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{urls.length === 1 ? "Comprobante" : `Comprobantes (${urls.length})`}</DialogTitle>
          {title && <DialogDescription>{title}</DialogDescription>}
        </DialogHeader>
        <ReceiptGallery urls={urls} />
      </DialogContent>
    </Dialog>
  );
}
