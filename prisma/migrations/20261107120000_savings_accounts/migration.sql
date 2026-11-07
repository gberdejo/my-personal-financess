-- Todas las cuentas son cuentas de ahorro: el tipo ya no se guarda.
-- Las cuentas existentes (de cualquier tipo) se conservan con sus transacciones.
ALTER TABLE "Account" DROP COLUMN "type";

DROP TYPE "AccountType";
