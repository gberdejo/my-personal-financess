import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountFormDialog } from "@/components/finance/account-form-dialog";
import { ConfirmDeleteButton } from "@/components/finance/confirm-delete-button";
import { deleteAccount } from "@/features/accounts/actions";
import { getAccountsWithBalance } from "@/features/accounts/queries";
import { formatCurrency } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";

export default async function CuentasPage() {
  const accounts = await getAccountsWithBalance();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Cuentas</h1>
        <AccountFormDialog />
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sin cuentas todavía</CardTitle>
            <CardDescription>
              Agregá una cuenta (efectivo, banco, tarjeta) para empezar a registrar movimientos.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardDescription>{ACCOUNT_TYPE_LABELS[account.type]}</CardDescription>
                  <CardTitle className="text-lg">{account.name}</CardTitle>
                </div>
                <ConfirmDeleteButton
                  title={`¿Eliminar "${account.name}"?`}
                  description="Se van a eliminar también todas las transacciones registradas en esta cuenta. Esta acción no se puede deshacer."
                  onConfirm={deleteAccount.bind(null, account.id)}
                />
              </CardHeader>
              <div className="px-6 pb-6">
                <span
                  className={`text-2xl font-semibold ${account.balance < 0 ? "text-destructive" : ""}`}
                >
                  {formatCurrency(account.balance)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
