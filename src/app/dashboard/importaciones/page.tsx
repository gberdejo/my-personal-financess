import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportMovementsDialog } from "@/components/finance/import-movements-dialog";
import { getAccounts } from "@/features/accounts/queries";
import { getImports } from "@/features/imports/queries";
import { formatDate, formatLimaDateTime } from "@/lib/format";
import { IMPORT_SOURCES } from "@/lib/imports/sources";

export default async function ImportacionesPage() {
  const [imports, accounts] = await Promise.all([getImports(), getAccounts()]);
  // La cuenta de la última importación, para no elegirla cada vez.
  const defaultAccountId = imports.find((item) => item.accountId)?.accountId ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-medium italic md:text-3xl">Importaciones</h1>
        <ImportMovementsDialog accounts={accounts} defaultAccountId={defaultAccountId} />
      </div>

      {imports.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sin importaciones todavía</CardTitle>
            <CardDescription>
              Subí el reporte de movimientos de Yape: quedan cargados y elegís cuáles se registran como transacciones,
              con su categoría. Cada archivo queda en este historial con lo que se aplicó y lo que no.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <ul>
              {imports.map((item) => (
                <li key={item.id} className="border-t first:border-t-0">
                  <Link
                    href={`/dashboard/importaciones/${item.id}`}
                    className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          {item.source ? IMPORT_SOURCES[item.source].label : item.rawSource}
                        </span>
                        <span className="truncate text-sm font-medium">{item.fileName}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.periodStart && item.periodEnd
                          ? `Del ${formatDate(item.periodStart)} al ${formatDate(item.periodEnd)}`
                          : "Sin movimientos"}
                        {item.accountName && ` · ${item.accountName}`} · importado el{" "}
                        {formatLimaDateTime(item.createdAt)}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      <span className="font-medium text-foreground">{item.counts.APPLIED}</span> aplicados ·{" "}
                      <span className="font-medium text-foreground">{item.counts.PENDING}</span> pendientes ·{" "}
                      {item.counts.DISCARDED} descartados
                      {item.skippedCount > 0 && ` · ${item.skippedCount} ya importados`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
