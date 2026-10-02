import type { BudgetTemplate } from "@/generated/prisma/client";

// Líneas sugeridas por plantilla. La categoría se busca por nombre entre las
// categorías de gasto del usuario (globales del seed incluidas); si no existe,
// se usa "Otros gastos".
type TemplateItem = { description: string; categoryName: string };

export const FALLBACK_CATEGORY_NAME = "Otros gastos";

export const BUDGET_TEMPLATE_ITEMS: Record<BudgetTemplate, TemplateItem[]> = {
  PARTY: [
    { description: "Local o alquiler", categoryName: "Entretenimiento" },
    { description: "Comida", categoryName: "Alimentación" },
    { description: "Bebidas", categoryName: "Supermercado" },
    { description: "Torta", categoryName: "Alimentación" },
    { description: "Decoración", categoryName: "Otros gastos" },
    { description: "Animación o música", categoryName: "Entretenimiento" },
  ],
  EVENT: [
    { description: "Lugar", categoryName: "Entretenimiento" },
    { description: "Catering", categoryName: "Alimentación" },
    { description: "Transporte", categoryName: "Transporte" },
    { description: "Materiales", categoryName: "Otros gastos" },
    { description: "Imprevistos", categoryName: "Otros gastos" },
  ],
  CONSTRUCTION: [
    { description: "Materiales", categoryName: "Vivienda" },
    { description: "Mano de obra", categoryName: "Vivienda" },
    { description: "Herramientas", categoryName: "Vivienda" },
    { description: "Flete de materiales", categoryName: "Transporte" },
    { description: "Retiro de desmonte", categoryName: "Vivienda" },
    { description: "Imprevistos", categoryName: "Otros gastos" },
  ],
  TRIP: [
    { description: "Pasajes", categoryName: "Transporte" },
    { description: "Alojamiento", categoryName: "Vivienda" },
    { description: "Comidas", categoryName: "Alimentación" },
    { description: "Transporte local", categoryName: "Transporte" },
    { description: "Actividades", categoryName: "Entretenimiento" },
  ],
  SHOPPING: [],
  BLANK: [],
};

export const BUDGET_TEMPLATES: BudgetTemplate[] = ["PARTY", "EVENT", "CONSTRUCTION", "TRIP", "SHOPPING", "BLANK"];
