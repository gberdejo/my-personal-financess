"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Repeat } from "lucide-react";
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
import { RouletteProviderFields } from "@/components/finance/roulette-provider-fields";
import { generateRoulettePlan } from "@/features/roulette/actions";
import type { RouletteProvider } from "@/features/roulette/queries";
import { parseDateOnly } from "@/lib/date";
import { formatCurrency } from "@/lib/format";
import { estimateOperationCount, planRoulette, rouletteFee, summarizeRoulette } from "@/lib/roulette";

// Igual que el tope del servidor.
const MAX_OPERATIONS = 200;

export function RoulettePlanDialog({
  scheduledPaymentId,
  dueDateValue,
  defaultNet,
  defaultStart,
  defaultEnd,
  providers,
}: {
  scheduledPaymentId: string;
  dueDateValue: string;
  // Lo que falta cubrir de la deuda.
  defaultNet: number;
  // "YYYY-MM-DD"
  defaultStart: string;
  defaultEnd: string;
  providers: RouletteProvider[];
}) {
  const [open, setOpen] = useState(false);
  const [net, setNet] = useState("");
  const [provider, setProvider] = useState("");
  const [feePercent, setFeePercent] = useState("");
  const [maxCharge, setMaxCharge] = useState("");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [state, formAction, pending] = useActionState(
    generateRoulettePlan.bind(null, scheduledPaymentId, dueDateValue),
    null
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setNet(defaultNet > 0 ? defaultNet.toFixed(2) : "");
      setStart(defaultStart);
      setEnd(defaultEnd);
      // Arranca con el último proveedor usado.
      if (!provider && providers[0]) {
        setProvider(providers[0].name);
        setFeePercent(String(Math.round(providers[0].feeRate * 10000) / 100));
      }
    }
  }

  const preview = useMemo(() => {
    const netValue = Number(net);
    const rate = Number(feePercent) / 100;
    const max = Number(maxCharge);
    const startDate = parseDateOnly(start);
    const endDate = parseDateOnly(end);
    if (!(netValue > 0) || !(rate >= 0 && rate <= 0.2) || !(max >= 1) || !startDate || !endDate || endDate < startDate) {
      return null;
    }
    const estimated = estimateOperationCount(netValue, rate, max);
    if (estimated > MAX_OPERATIONS) return { tooMany: estimated } as const;
    const plan = planRoulette({ net: netValue, rate, maxCharge: max, start: startDate, end: endDate });
    const totals = summarizeRoulette(plan.map((op) => ({ charge: op.charge, fee: rouletteFee(op.charge, rate) })));
    return { count: plan.length, ...totals } as const;
  }, [net, feePercent, maxCharge, start, end]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Repeat />
          Generar ruleteo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generar ruleteo</DialogTitle>
          <DialogDescription>
            Reparte lo que necesitás recibir en operaciones chicas. Cada una carga a la tarjeta y te llega el monto menos
            la comisión. Después podés editar cada operación.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-net">Necesito recibir (S/)</Label>
              <Input
                id="plan-net"
                name="net"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={net}
                onChange={(e) => setNet(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-max">Máximo por operación (S/)</Label>
              <Input
                id="plan-max"
                name="maxCharge"
                type="number"
                step="0.01"
                min="1"
                inputMode="decimal"
                placeholder="Tu línea disponible"
                value={maxCharge}
                onChange={(e) => setMaxCharge(e.target.value)}
                required
              />
            </div>
          </div>

          <RouletteProviderFields
            providers={providers}
            provider={provider}
            feePercent={feePercent}
            onProviderChange={setProvider}
            onFeePercentChange={setFeePercent}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-start">Desde</Label>
              <Input
                id="plan-start"
                name="start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-end">Hasta</Label>
              <Input id="plan-end" name="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </div>
          </div>

          {preview && "tooMany" in preview && (
            <p className="text-sm text-muted-foreground">
              Serían {preview.tooMany} operaciones. Subí el máximo por operación.
            </p>
          )}

          {preview && "count" in preview && (
            <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/60 p-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Operaciones</span>
                <span className="font-semibold tabular-nums">{preview.count}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Cargás a la tarjeta</span>
                <span className="font-semibold tabular-nums">{formatCurrency(preview.charged)}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Comisiones</span>
                <span className="font-semibold text-expense tabular-nums">{formatCurrency(preview.fees)}</span>
              </div>
            </div>
          )}

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Generando…" : preview && "count" in preview ? `Generar ${preview.count} operaciones` : "Generar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
