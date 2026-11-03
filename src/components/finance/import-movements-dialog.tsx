"use client";

import { useActionState, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaymentMethodSelect } from "@/components/finance/payment-method-select";
import { createImport } from "@/features/imports/actions";
import { IMPORT_SOURCE_LIST, IMPORT_SOURCES, type ImportSource } from "@/lib/imports/sources";

type AccountOption = { id: string; name: string };

// Subir un reporte (Yape o la plantilla genérica). Al importar se abre la importación
// para elegir qué movimientos se vuelven transacciones.
export function ImportMovementsDialog({
  accounts,
  defaultAccountId,
}: {
  accounts: AccountOption[];
  defaultAccountId: string | null;
}) {
  const [source, setSource] = useState<ImportSource>("YAPE");
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");
  const [state, formAction, pending] = useActionState(createImport, null);
  const definition = IMPORT_SOURCES[source];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <FileUp />
          Importar archivo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar movimientos</DialogTitle>
          <DialogDescription>
            Los movimientos quedan cargados y después elegís cuáles se registran como transacciones.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-source">Origen</Label>
            <input type="hidden" name="source" value={source} />
            <Select value={source} onValueChange={(value) => setSource(value as ImportSource)}>
              <SelectTrigger id="import-source" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPORT_SOURCE_LIST.map((value) => (
                  <SelectItem key={value} value={value}>
                    {IMPORT_SOURCES[value].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{definition.help}</p>
            {definition.template && (
              <a
                href={definition.template}
                download
                className="flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <Download className="size-3.5" />
                Descargar plantilla
              </a>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="import-account">Cuenta</Label>
            <input type="hidden" name="accountId" value={accountId} />
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="import-account" className="w-full">
                <SelectValue placeholder="Elegí una cuenta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              De dónde sale o a dónde entra la plata (ej. la cuenta de ahorros vinculada a tu Yape). Se puede cambiar por
              movimiento.
            </p>
          </div>

          {definition.paymentMethod === null && (
            <div className="flex flex-col gap-1">
              {/* `key`: se reinicia al cambiar de origen. */}
              <PaymentMethodSelect key={source} id="import-payment-method" />
              <p className="text-xs text-muted-foreground">
                Para los gastos. Si una fila trae su método de pago, se usa el de la fila.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="import-file">Archivo</Label>
            <Input id="import-file" name="file" type="file" accept={definition.accept} required />
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending || !accountId}>
              {pending ? "Importando…" : "Importar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
