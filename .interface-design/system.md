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

### Calendario de pagos
Grilla lunes–domingo en `md:` (`min-h-28`, días fuera del mes en `bg-muted/30`, hoy en círculo `bg-primary`); en móvil se reemplaza por agenda agrupada por día. Cada cuota usa la marca de Planificado → aplicado (`OccurrenceStatusMark`): pendiente punteada, pagada `bg-expense` con check, vencida punteada `border-destructive` con monto `text-destructive`, omitida `bg-muted` con guion y monto tachado.

### Cronograma de tarjeta
Tabla de 12 filas (en móvil, cada fila apila sus campos): mes, consumos (`formatDayMonth`), cierre y pago con `input type="date"` y el día de la semana debajo (`formatWeekdayDayMonth`). Los meses que todavía salen de la regla llevan la mini-etiqueta "Según la regla" y el texto de los inputs en `text-muted-foreground`; los editados, "Sin guardar" en `text-primary`. El estado de cada vencimiento reutiliza `OccurrenceStatusMark` y enlaza a "Deuda del estado de cuenta".

### Préstamos
Tarjeta por préstamo como la de Presupuestos (chip con la entidad, próxima cuota en serif itálica con la cuenta regresiva, "Cancelado" en `text-income`). La barra `LoanProgress` muestra el capital devuelto en `bg-income` (es deuda que baja, no un gasto). El cronograma se agrupa por año con `<details>` (año actual y siguiente abiertos); cada cuota reutiliza `OccurrenceStatusMark` y un capital negativo (periodo de gracia) va en `text-destructive`.

### Filtro de tipo (segmentado)
`MovementKindFilter` (`movement-kind-filter.tsx`): `Todos | Ingresos | Gastos` como `role="radiogroup"` sobre `bg-muted p-0.5 rounded-lg h-9`; la opción activa en `bg-background font-medium ring-1 ring-foreground/10`, las demás `text-muted-foreground`. Ingresos y Gastos llevan un punto `size-1.5 rounded-full` en `bg-income` / `bg-expense` (el color del monto en la lista). En móvil ocupa todo el ancho (`grid-cols-3`).

### Barra de consulta (Transacciones)
Encabezado con el título a la izquierda y las acciones de crear a la derecha (Importar outline, solo ícono en móvil; Agregar primario). Debajo, una sola barra `rounded-xl border bg-card p-2`: primero el tipo segmentado, separador `h-6 w-px bg-border`, luego los filtros secundarios (periodo, cuenta, método; en móvil fila con scroll horizontal) y Buscar al final (`sm:ml-auto`, ancho completo en móvil). Los filtros son borradores que se aplican juntos con Buscar. Debajo, una línea de resumen `text-sm text-muted-foreground tabular-nums` con conteo y totales coloreados (`text-income` / `text-expense`) y "Limpiar filtros" (`text-primary`) a la derecha.

### Pago de tarjeta por moneda (modal del calendario)
Encabezado: nombre + `OccurrenceStatusMark` chica con el estado ("Pagado en parte"), y debajo "Vence el … · consumos del … al …". Sección "Lo que debes" (mini-etiqueta en mayúsculas + enlace "Estado de cuenta →") con una lista `divide-y rounded-xl border`: una fila por moneda (Soles, Dólares) con la marca de Planificado → aplicado, el monto `text-base font-semibold` con `occurrenceAmountClass`, el detalle en `text-xs` (pendiente/vencido y si sale del estado de cuenta o del estimado; pagado con fecha, cuenta y TC) y una sola acción: "Pagar" o deshacer (ícono `Undo2`). Sin consumos en esa moneda: marca `SKIPPED` y monto en `text-muted-foreground`. El formulario se abre debajo de su fila (`rounded-lg bg-muted/50 p-3`), uno a la vez; en dólares, los TC sugeridos son pastillas `rounded-full border text-xs` (la activa en `bg-primary/10 text-primary`) y se muestra al momento "= S/ X salen de tu cuenta". El botón de envío dice el monto ("Pagar US$ 45.00").
