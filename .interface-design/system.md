# Sistema de diseño — Finanzas personales

## Dirección y sensación

Calmo y reflexivo: una persona revisando su mes y preguntándose en qué se le fue el dinero. Interfaz sobria, verde petróleo frío con un acento cobre cálido para gastos. Nada decorativo: el color siempre significa algo (ingreso vs. gasto).

## Tokens (src/app/globals.css)

- Fondo `--background` #f5f7f6, tarjetas `--card` blanco, sidebar igual al fondo (separado por borde).
- Texto: `--foreground` #1c2624, secundario `--muted-foreground` #5c6b67.
- Semánticos: `--income` #0e6e63 (verde petróleo, también `--primary`), `--expense` #b3672e (cobre), `--destructive` #b3402c.
- Bordes: rgba `rgb(28 38 36 / 10%)`, nunca hex sólido.
- Gráficos: `--chart-1..5` en ese orden; las categorías toman color por índice.
- Radio base `--radius` 0.85rem.

## Profundidad

Solo bordes + superficie `Card` (shadcn). Sin sombras dramáticas ni gradientes.

## Tipografía

- Títulos de página: `font-heading` (serif) itálica, `text-2xl md:text-3xl font-medium`.
- Cifras: `font-sans font-semibold tabular-nums`; montos siempre con `tabular-nums`.
- Etiquetas pequeñas: `text-xs text-muted-foreground`; mini-etiquetas en mayúsculas `text-[10px] tracking-wide uppercase`.
- Números de ranking: `font-heading italic text-muted-foreground` (eco del título).

## Espaciado

Base 4px (escala Tailwind). `gap-4` entre tarjetas y secciones; `gap-3` entre filas de listas; `gap-1.5` dentro de una fila.

## Patrones de componentes

### Tarjeta de métrica (Resumen)
`Card` > `CardHeader` con `CardDescription` (etiqueta) + `CardTitle` (`font-sans text-2xl not-italic font-semibold tabular-nums`), coloreado con `text-income` / `text-expense`.

### Fila de transacción
Descripción (o categoría si no hay) en `text-sm font-medium truncate`; debajo `categoría · fecha` en `text-xs text-muted-foreground`. Monto a la derecha con signo `+`/`-` y color income/expense. Fechas con `formatTransactionDate` (UTC).

### Lista con proporción (ej. Gastos más altos, `top-expenses-list.tsx`)
Número de puesto en serif itálica + barra fina `h-1 rounded-full bg-muted` con relleno `bg-expense/70` que muestra el % del total del periodo, % en `text-xs` a la derecha. Pie con `border-t pt-3 text-xs` que resume en una frase lo que significan los datos (cifras clave en `text-foreground font-medium`).

### Marcas de conteo (frecuencia)
Para "cuántas veces", una marca `h-2.5 w-[3px] rounded-full bg-expense/70` por ocurrencia (gap 3px, máximo 12 y luego `+n`), con la frecuencia `N×` en serif itálica a la izquierda (ej. `recurring-expenses-list.tsx`).

### Estados vacíos
Texto simple `text-sm text-muted-foreground` dentro del `CardContent` ("No hay … en este periodo.").

### Layout del Resumen
Métricas: `grid sm:grid-cols-2 lg:grid-cols-3`. Detalle: `grid lg:grid-cols-2` en 2×2 (categorías, gastos más altos, gastos recurrentes, transacciones); mantener un número par de tarjetas para que ninguna quede sola. Recarga por periodo con `opacity-60` mientras `isPending`.

### Planificado → aplicado (Presupuestos)
Una línea de presupuesto tiene dos estados. Pendiente: círculo `size-5` con borde punteado `border-dashed border-muted-foreground/50`. Aplicado: círculo relleno `bg-expense text-background` con un check; el monto pasa a `text-expense` y, si difiere del planificado, el planificado se muestra tachado debajo. La barra `BudgetProgress` (aplicado vs. planificado, relleno `bg-expense`) se usa en la lista y en el detalle. Las acciones masivas que generan gastos usan el botón cobre `bg-expense text-background`.

### Chip de tipo
`rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary` (p. ej. la plantilla de un presupuesto).

### Cuenta regresiva
`font-heading italic` con `formatCountdown(daysUntil(date))` ("faltan 43 días"); en `text-muted-foreground` si ya pasó o no hay fecha.
