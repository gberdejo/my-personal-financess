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
- **Calendario** (`features/schedule`, reglas en `src/lib/schedule.ts`): un `ScheduledPayment` es una regla (fecha inicial + frecuencia); sus cuotas se calculan al vuelo y solo se guarda una `ScheduledOccurrence` al pagar u omitir una fecha. Pagar un servicio crea una `Transaction` (borrarla devuelve la cuota a pendiente por cascade); pagar una tarjeta solo marca la cuota, y su monto estimado es la suma de gastos con método `CREDIT_CARD` del ciclo de facturación. Las fechas de una tarjeta salen de su cronograma (`CardBillingPeriod`, un mes por fila con cierre y pago exactos del banco, página `/dashboard/calendario/tarjeta/[id]`) y, para los meses sin fila, de la regla `closingDay`/`dueDay` (`cardOccurrences` en `src/lib/schedule.ts`). Todo lo que cuelga de un vencimiento (cuota, deuda, ruleteos) se identifica por su `dueDate`: si una fecha de pago cambia hay que moverlo con `moveDueDate` (`features/schedule/periods.ts`).
- **Ruleteo de tarjetas** (`features/roulette`, cálculo en `src/lib/roulette.ts`): por vencimiento de tarjeta se guarda la deuda ingresada (`CardStatement`, si no hay se usa el estimado) y operaciones `RouletteOperation` con comisión descontada (se carga `charge`, llega `charge − fee`). Las cuotas y los ruleteos se identifican por `(scheduledPaymentId, dueDate)`. Registrar una operación crea el gasto de la comisión (motivo "Comisión ruleteo"); borrar ese gasto la devuelve a planificada (`onDelete: SetNull`). Detalle en `/dashboard/calendario/pago/[id]/[fecha]`.
- **Método de pago**: solo en gastos (`null` en ingresos y en gastos antiguos, que se filtran como `"NONE"`). Es informativo; el saldo lo mueve la cuenta.

# Fechas (importante)

`Transaction.date` y `Budget.date` son días calendario guardados como **medianoche UTC**. Usar los helpers de `src/lib/date.ts` (`parseDateOnly`, `monthRange`, `dayRange`, `toUTCDateInputValue`, `todayInLima`) y de `src/lib/format.ts` (formatters con `timeZone: "UTC"`) para no correr el día según la zona horaria. `createdAt` sí es un instante real y se muestra en hora de Lima. Moneda: PEN con `formatCurrency`.

# Migraciones

Si Prisma generaría DROP + CREATE (renombres) o hace falta migrar datos, la migración se escribe a mano en SQL para no perder datos (ver `prisma/migrations/20261005230000_transaction_reason`). `backups/` guarda volcados locales con datos personales (ignorado por git); no leerlo ni commitearlo sin necesidad.

# Diseño

El sistema de diseño está en `.interface-design/system.md` (tokens en `src/app/globals.css`: `--income` verde petróleo, `--expense` cobre; títulos `font-heading` itálica; montos con `tabular-nums`). Seguirlo al crear o modificar UI. Los componentes de `src/components/ui/` son de shadcn.
