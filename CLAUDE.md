# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# Reglas del proyecto

- No ejecutes pruebas, tests, ni el servidor de desarrollo para verificar cambios (por ejemplo `npm test`, `npm run dev`, `npm run build` con fines de comprobación). El usuario se encarga de probar los cambios manualmente. Limítate a implementar el código solicitado.
- La UI, los mensajes de error y los comentarios del código están en español (es-PE). Las rutas del dashboard también (`/dashboard/transacciones`, `/cuentas`, `/categorias`, `/presupuestos`).

# Stack

Next.js 16 (App Router, `src/`), React 19, Prisma 7 con `@prisma/adapter-pg` sobre Postgres (Neon), Clerk para auth, shadcn/ui (estilo `radix-nova`) + Tailwind 4, Recharts. Gestor de paquetes: **pnpm**. No hay framework de tests.

# Comandos

- `pnpm lint` — ESLint (config de `eslint-config-next`).
- `pnpm db:migrate` — `prisma migrate dev` (crea y aplica una migración en desarrollo).
- `pnpm db:deploy` / `pnpm db:push` / `pnpm db:seed` / `pnpm db:studio`.
- `pnpm install` corre `prisma generate` (postinstall). El cliente se genera en `src/generated/prisma` (ignorado por git); importar siempre desde `@/generated/prisma/client`, no desde `@prisma/client`.

Variables de entorno en `.env.local` (ver `.env.example`): `DATABASE_URL` y las claves de Clerk. `prisma.config.ts` y `prisma/seed.ts` cargan `.env.local` con dotenv.

# Arquitectura

- **Auth**: `src/proxy.ts` (el antiguo `middleware.ts` en Next 16) protege `/dashboard(.*)` con `clerkMiddleware`. Toda query/acción llama a `requireUserId()` (`src/lib/auth.ts`) y filtra por `userId`; no hay tabla de usuarios, `userId` es el id de Clerk.
- **Capa de datos por feature** (`src/features/<feature>/`):
  - `queries.ts`: lecturas que llaman las páginas (Server Components). Convierten `Decimal` a `number` antes de devolver datos.
  - `actions.ts`: Server Actions (`"use server"`) con firma `(prevState, formData) => Promise<{ error?: string } | null>` para usar con `useActionState`. Validan a mano, verifican propiedad (`findFirst({ where: { id, userId } })`), escriben con Prisma y llaman `revalidatePath` en todas las páginas afectadas.
  - Las páginas en `src/app/dashboard/**` son Server Components que leen `searchParams` (p. ej. `?month=YYYY-MM&method=...`) y pasan datos a componentes cliente en `src/components/finance/`.
- **Categorías y motivos**: `Category` y `CategoryReason` con `userId = null` son predefinidos (vienen del seed) y compartidos; las consultas usan `OR: [{ userId: null }, { userId }]`. `Transaction.reason` es el "para qué" estructurado (con sugerencias por categoría, agrupa gastos recurrentes; se compara con `normalizeReason`), y `description` es una nota libre.
- **Saldos**: no se guardan. El saldo de una cuenta es `initialBalance` + ingresos − gastos, calculado en `features/accounts/queries.ts`.
- **Presupuestos**: un `Budget` tiene `BudgetItem` planificados. "Aplicar" una línea crea una `Transaction` real (en `prisma.$transaction`) y la enlaza vía `transactionId`; borrar esa transacción devuelve la línea a pendiente (`onDelete: SetNull`). Por eso las acciones de transacciones también revalidan `/dashboard/presupuestos`.
- **Calendario** (`features/schedule`, reglas en `src/lib/schedule.ts`): un `ScheduledPayment` es una regla (fecha inicial + frecuencia); sus cuotas se calculan al vuelo y solo se guarda una `ScheduledOccurrence` al pagar u omitir una fecha. Pagar un servicio crea una `Transaction` (borrarla devuelve la cuota a pendiente por cascade); pagar una tarjeta solo marca la cuota, y su monto estimado es la suma de gastos con método `CREDIT_CARD` del ciclo de facturación. Al marcarla se guarda ese estimado (`ScheduledOccurrence.estimatedAtPayment`); si después cambian los gastos del ciclo, el calendario avisa (`cycleChange`) hasta que el usuario lo da por visto (`acknowledgeCardCycleChange`). Editar el monto de una transacción actualiza el `amount` de la cuota que pagó. Los gastos de un prepago o de una comisión de ruleteo tienen el monto fijo (`amountLock`, `src/lib/transaction-lock.ts`): el formulario no lo muestra editable y el servidor conserva el actual; se cambia desde su pantalla. Las fechas de una tarjeta salen de su cronograma (`CardBillingPeriod`, un mes por fila con cierre y pago exactos del banco, página `/dashboard/calendario/tarjeta/[id]`) y, para los meses sin fila, de la regla `closingDay`/`dueDay` (`cardOccurrences` en `src/lib/schedule.ts`). Todo lo que cuelga de un vencimiento (cuota, deuda, ruleteos) se identifica por su `dueDate`: si una fecha de pago cambia hay que moverlo con `moveDueDate` (`features/schedule/periods.ts`).
- **Préstamos** (`features/loans`, generador en `src/lib/loan.ts`): un préstamo es un `ScheduledPayment` de tipo `LOAN` con un `Loan` 1:1 (parámetros) y sus `LoanInstallment` (cronograma con capital, interés, seguros, cuota y saldo). Sus vencimientos son las fechas de las cuotas (`loadDateSources` en `features/schedule/periods.ts`), así que se pagan como cualquier cuota del calendario (`payOccurrence`: un gasto por el monto pagado, con el desglose en la descripción; `markOnly` marca sin crear gasto). El generador usa cuota fija con periodos de días reales: interés = saldo × ((1 + TEA)^(días/base) − 1), seguros prorrateados por días/30. Los prepagos (`LoanPrepayment`, en cualquier fecha, a plazo `TERM` o a cuota `INSTALLMENT`, planificados o registrados) van todo a capital y parten el interés del periodo en dos tramos; cualquier cambio rehace las cuotas siguientes con `rebuildAfter` (`features/loans/actions.ts` → `rebuildSchedule` en `src/lib/loan.ts`), que parte de `Loan.installments` (plazo) y `Loan.baseInstallment` para poder devolver cuotas si se borra un prepago a plazo. Para números exactos al banco, el cronograma se importa en CSV (`src/lib/loan-csv.ts`, plantilla en `public/plantillas/cronograma-prestamo.csv`, descarga del actual en `prestamos/[id]/cronograma/route.ts` — sin extensión porque `src/proxy.ts` excluye de Clerk las rutas `.csv`): importar guarda las cuotas tal cual, conserva las pagadas y no recalcula. Una cuota con total 0 (periodo de gracia: el interés se capitaliza) es la cuota 0: queda en el cronograma pero no es vencimiento (no sale en el calendario ni se paga) y no cuenta en "Cuota N/M"; la numeración por fecha la da `installmentNumbers` (`src/lib/loan.ts`). Debe servir para cualquier banco o persona: nada de reglas de un banco en particular.
- **Ruleteo de tarjetas** (`features/roulette`, cálculo en `src/lib/roulette.ts`): por vencimiento de tarjeta se guarda la deuda ingresada (`CardStatement`, si no hay se usa el estimado) y operaciones `RouletteOperation` con comisión descontada (se carga `charge`, llega `charge − fee`). Las cuotas y los ruleteos se identifican por `(scheduledPaymentId, dueDate)`. Registrar una operación crea el gasto de la comisión (motivo "Comisión ruleteo"); borrar ese gasto la devuelve a planificada (`onDelete: SetNull`). Detalle en `/dashboard/calendario/pago/[id]/[fecha]`.
- **Importaciones** (`features/imports`, lectores en `src/lib/imports/`): se sube un archivo (por ahora el reporte de Yape) y se guarda como `TransactionImport` con sus `ImportedMovement` (instante real `occurredAt` + día `date`). El usuario elige cuáles aplicar: aplicar crea una `Transaction` (con `createdAt = occurredAt` para que se vea la hora real) y la enlaza (`createdTransaction = true`); también se puede vincular a una transacción existente (posible duplicado, `createdTransaction = false`). Borrar la transacción devuelve el movimiento a pendiente (`onDelete: SetNull`); varios movimientos pueden apuntar a la misma transacción (el mismo Yape en otro estado de cuenta). Al importar se saltan los movimientos cuya `fingerprint` (fuente, instante, tipo, monto y contraparte) ya existe en otra importación del usuario (`skippedCount`). Además de Yape está la plantilla genérica (`public/plantillas/movimientos.csv`, lector `src/lib/imports/generic.ts`): fecha, hora, tipo y monto, y opcionales categoría (por nombre), motivo y método de pago, que se guardan en el movimiento como propuesta; el método por defecto se elige al importar (`TransactionImport.paymentMethod`). Cada formato es una entrada de `IMPORT_SOURCES` (`src/lib/imports/sources.ts`) con su lector, que recibe las filas de texto de `readSheet` (SheetJS, solo en el servidor).
- **Comprobantes**: `Transaction.receiptUrls` guarda solo links (no archivos), validados con `src/lib/receipts.ts`. De un link de Drive se saca el ID para la miniatura (`drive.google.com/thumbnail?id=`) y el visor (`/file/d/<id>/preview` en un iframe); se ve solo si el archivo está compartido como "Cualquier persona con el enlace". Se cargan al crear/editar una transacción o desde la columna `comprobantes` de la plantilla genérica (Yape no los trae).
- **Método de pago**: solo en gastos (`null` en ingresos y en gastos antiguos, que se filtran como `"NONE"`). Es informativo; el saldo lo mueve la cuenta.

# Fechas (importante)

`Transaction.date` y `Budget.date` son días calendario guardados como **medianoche UTC**. Usar los helpers de `src/lib/date.ts` (`parseDateOnly`, `monthRange`, `dayRange`, `toUTCDateInputValue`, `todayInLima`) y de `src/lib/format.ts` (formatters con `timeZone: "UTC"`) para no correr el día según la zona horaria. `createdAt` sí es un instante real y se muestra en hora de Lima. Moneda: PEN con `formatCurrency`.

# Migraciones

Si Prisma generaría DROP + CREATE (renombres) o hace falta migrar datos, la migración se escribe a mano en SQL para no perder datos (ver `prisma/migrations/20261005230000_transaction_reason`). `backups/` guarda volcados locales con datos personales (ignorado por git); no leerlo ni commitearlo sin necesidad.

# Diseño

El sistema de diseño está en `.interface-design/system.md` (tokens en `src/app/globals.css`: `--income` verde petróleo, `--expense` cobre; títulos `font-heading` itálica; montos con `tabular-nums`). Seguirlo al crear o modificar UI. Los componentes de `src/components/ui/` son de shadcn.
