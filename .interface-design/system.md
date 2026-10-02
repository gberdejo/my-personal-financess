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

### Estados vacíos
Texto simple `text-sm text-muted-foreground` dentro del `CardContent` ("No hay … en este periodo.").

### Layout del Resumen
Métricas: `grid sm:grid-cols-2 lg:grid-cols-3`. Detalle: `grid lg:grid-cols-2 xl:grid-cols-3`; la tarjeta que sobra en lg ocupa `lg:col-span-2 xl:col-span-1`. Recarga por periodo con `opacity-60` mientras `isPending`.
