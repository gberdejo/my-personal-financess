"use client";

import { useTransition } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setMovementsDiscarded, unapplyMovement } from "@/features/imports/actions";

// Quita la transacción de un movimiento aplicado: si la creó la importación se
// borra; si estaba vinculada a una existente, solo se desvincula.
export function UnapplyMovementButton({ movementId, created }: { movementId: string; created: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => unapplyMovement(movementId))}
    >
      <Undo2 />
      {created ? "Quitar transacción" : "Desvincular"}
    </Button>
  );
}

export function RestoreMovementButton({ importId, movementId }: { importId: string; movementId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => setMovementsDiscarded(importId, [movementId], false))}
    >
      <Undo2 />
      Restaurar
    </Button>
  );
}
