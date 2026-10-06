import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type TransactionKind } from "../src/generated/prisma/client";

config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type SeedCategory = { name: string; icon: string; reasons: string[] };

const INCOME_CATEGORIES: SeedCategory[] = [
  { name: "Sueldo", icon: "Wallet", reasons: ["Sueldo", "Gratificación", "CTS", "Bono"] },
  { name: "Freelance", icon: "Briefcase", reasons: ["Proyecto", "Consultoría"] },
  { name: "Inversiones", icon: "TrendingUp", reasons: ["Intereses", "Dividendos"] },
  { name: "Otros ingresos", icon: "CirclePlus", reasons: ["Reembolso", "Venta", "Regalo"] },
];

const EXPENSE_CATEGORIES: SeedCategory[] = [
  {
    name: "Alimentación",
    icon: "UtensilsCrossed",
    reasons: ["Desayuno", "Almuerzo", "Cena", "Café", "Delivery", "Snacks"],
  },
  {
    name: "Supermercado",
    icon: "ShoppingCart",
    reasons: ["Compras del mes", "Mercado", "Bodega", "Frutas y verduras"],
  },
  { name: "Transporte", icon: "Bus", reasons: ["Taxi", "Bus", "Metro", "Peaje", "Estacionamiento"] },
  { name: "Combustible", icon: "Fuel", reasons: ["Gasolina", "GLP", "GNV"] },
  {
    name: "Auto y repuestos",
    icon: "Wrench",
    reasons: ["Mantenimiento", "Cambio de aceite", "Lavado", "Repuestos", "SOAT"],
  },
  {
    name: "Entretenimiento",
    icon: "Popcorn",
    reasons: ["Cine", "Streaming", "Música", "Salida con amigos", "Videojuegos"],
  },
  {
    name: "Salud",
    icon: "HeartPulse",
    reasons: ["Farmacia", "Consulta médica", "Análisis", "Dentista", "Seguro de salud"],
  },
  { name: "Servicios", icon: "Zap", reasons: ["Luz", "Agua", "Internet", "Celular", "Gas"] },
  { name: "Vivienda", icon: "Home", reasons: ["Alquiler", "Mantenimiento", "Arbitrios", "Limpieza"] },
  { name: "Educación", icon: "GraduationCap", reasons: ["Mensualidad", "Cursos", "Libros", "Útiles"] },
  { name: "Ropa", icon: "Shirt", reasons: ["Ropa", "Zapatillas", "Accesorios"] },
  { name: "Otros gastos", icon: "MoreHorizontal", reasons: ["Regalo", "Donación", "Comisión bancaria"] },
];

async function seedGlobalCategory({ name, icon, reasons }: SeedCategory, kind: TransactionKind) {
  const existing = await prisma.category.findFirst({ where: { userId: null, name, kind } });
  const category = existing
    ? await prisma.category.update({ where: { id: existing.id }, data: { icon } })
    : await prisma.category.create({ data: { userId: null, name, icon, kind } });

  // Una por una para que el orden de creación respete el de la lista.
  for (const reason of reasons) {
    const found = await prisma.categoryReason.findFirst({
      where: { userId: null, categoryId: category.id, name: reason },
    });
    if (!found) {
      await prisma.categoryReason.create({
        data: { userId: null, categoryId: category.id, name: reason },
      });
    }
  }
}

async function main() {
  for (const category of INCOME_CATEGORIES) {
    await seedGlobalCategory(category, "INCOME");
  }

  for (const category of EXPENSE_CATEGORIES) {
    await seedGlobalCategory(category, "EXPENSE");
  }

  console.log("Categorías y motivos predefinidos cargados.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
