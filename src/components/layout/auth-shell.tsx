import { Landmark } from "lucide-react";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <div className="flex items-center gap-2">
        <Landmark className="size-5" />
        <span className="font-semibold">Finanzas Personales</span>
      </div>
      {children}
    </div>
  );
}
