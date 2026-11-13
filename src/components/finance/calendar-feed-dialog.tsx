"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Smartphone } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  disableCalendarFeed,
  enableCalendarFeed,
  regenerateCalendarFeed,
  type CalendarFeedState,
} from "@/features/calendar-feed/actions";

type FeedAction = (prevState: CalendarFeedState, formData: FormData) => Promise<CalendarFeedState>;

function ConfirmAction({
  label,
  title,
  description,
  action,
}: {
  label: string;
  title: string;
  description: string;
  action: FeedAction;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await action(null, new FormData());
              })
            }
          >
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CalendarFeedDialog({ httpsUrl, webcalUrl }: { httpsUrl: string | null; webcalUrl: string | null }) {
  const [, enableAction, enabling] = useActionState(enableCalendarFeed, null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!httpsUrl) return;
    await navigator.clipboard.writeText(httpsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Smartphone />
          Sincronizar con el celular
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Calendario en el celular</DialogTitle>
          <DialogDescription>
            Tus pagos aparecen en el calendario del iPhone (o de Google) y se actualizan solos. Es de solo lectura.
          </DialogDescription>
        </DialogHeader>

        {!httpsUrl || !webcalUrl ? (
          <form action={enableAction} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Se publican los vencimientos de servicios, tarjetas y préstamos (con monto y estado), los cierres de
              tarjeta y los prepagos. Los pendientes avisan el día anterior a las 9:00.
            </p>
            <Button type="submit" disabled={enabling} className="w-fit">
              {enabling ? "Creando…" : "Crear link"}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <Button asChild className="w-fit">
              <a href={webcalUrl}>Abrir en el iPhone</a>
            </Button>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">O copiá el link</p>
              <div className="flex gap-2">
                <Input readOnly value={httpsUrl} onFocus={(event) => event.currentTarget.select()} />
                <Button type="button" variant="outline" onClick={copy}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Agregarlo a mano en el iPhone</p>
              <p>Ajustes › Calendario › Cuentas › Agregar cuenta › Otra › Agregar calendario suscrito.</p>
              <p>
                El iPhone lo refresca solo, normalmente cada hora o según Ajustes › Calendario › Cuentas › Obtener
                datos.
              </p>
            </div>

            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Cualquiera que tenga este link puede ver tus pagos y montos. Si lo compartiste por error, generá otro.
            </p>

            <div className="flex flex-wrap gap-2">
              <ConfirmAction
                label="Generar otro link"
                title="¿Generar otro link?"
                description="El link actual deja de funcionar y tendrás que volver a suscribir el calendario con el nuevo."
                action={regenerateCalendarFeed}
              />
              <ConfirmAction
                label="Desactivar"
                title="¿Desactivar la sincronización?"
                description="El link se borra y el calendario del celular dejará de actualizarse."
                action={disableCalendarFeed}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
