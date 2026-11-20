import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Fecha del movimiento: el `<input type="date">` nativo, que se elige en un solo paso
// (sin botón ni popover intermedio). Se envía como `name` (YYYY-MM-DD).
export function CompactDateField({
  id,
  name = "date",
  defaultValue,
  label = "Fecha",
}: {
  id: string;
  name?: string;
  defaultValue: string;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={id} name={name} type="date" defaultValue={defaultValue} className="tabular-nums" required />
    </div>
  );
}
