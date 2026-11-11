-- Pago de una tarjeta: sale de la cuenta, pero no es un gasto (los gastos son sus consumos).
ALTER TYPE "TransactionKind" ADD VALUE 'CARD_PAYMENT';

-- Los consumos con tarjeta no tienen cuenta hasta que se paga la tarjeta.
-- Los gastos con tarjeta ya registrados conservan su cuenta (ya descontados).
ALTER TABLE "Transaction" ALTER COLUMN "accountId" DROP NOT NULL;
