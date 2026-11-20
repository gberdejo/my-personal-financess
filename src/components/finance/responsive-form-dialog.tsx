"use client";

import type { ReactNode, Ref } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

// Formulario en un modal (escritorio) o en un panel desde abajo (celular), donde el
// cuerpo hace scroll y el pie con los botones queda fijo y siempre visible.
// El `<form>` envuelve cuerpo y pie para que Guardar siga siendo un `submit`.
export function ResponsiveFormDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  action,
  formRef,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  action: (formData: FormData) => void;
  formRef?: Ref<HTMLFormElement>;
  children: ReactNode;
  footer: ReactNode;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[90dvh] gap-0 rounded-t-xl p-0">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <form ref={formRef} action={action} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-3">{children}</div>
            <SheetFooter className="border-t bg-popover pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={action} className="flex flex-col gap-3">
          {children}
          <DialogFooter>{footer}</DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
