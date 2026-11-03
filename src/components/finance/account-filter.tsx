"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "ALL";

// Filtra por cuenta vía `?account=`, conservando los demás filtros (mes, método).
export function AccountFilter({ accounts, value }: { accounts: { id: string; name: string }[]; value: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next === ALL) params.delete("account");
    else params.set("account", next);
    router.push(`${pathname}?${params.toString()}`);
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
