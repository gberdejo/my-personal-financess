"use client";

import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "ALL";

// Selector de cuenta controlado: `null` es "Todas las cuentas".
export function AccountFilter({
  accounts,
  value,
  onChange,
}: {
  accounts: { id: string; name: string }[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  function handleChange(next: string) {
    onChange(next === ALL ? null : next);
  }

  if (accounts.length < 2) return null;

  return (
    <Select value={value ?? ALL} onValueChange={handleChange}>
      <SelectTrigger className="w-44" aria-label="Filtrar por cuenta">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todas las cuentas</SelectItem>
        <SelectSeparator />
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
