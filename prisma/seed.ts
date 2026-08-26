import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type TransactionKind } from "../src/generated/prisma/client";

config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const INCOME_CATEGORIES = [
  { name: "Sueldo", icon: "Wallet" },
  { name: "Freelance", icon: "Briefcase" },
  { name: "Inversiones", icon: "TrendingUp" },
  { name: "Otros ingresos", icon: "CirclePlus" },
];

const EXPENSE_CATEGORIES = [
  { name: "Alimentación", icon: "UtensilsCrossed" },
  { name: "Supermercado", icon: "ShoppingCart" },
  { name: "Transporte", icon: "Bus" },
  { name: "Combustible", icon: "Fuel" },
  { name: "Auto y repuestos", icon: "Wrench" },
  { name: "Entretenimiento", icon: "Popcorn" },
  { name: "Salud", icon: "HeartPulse" },
  { name: "Servicios", icon: "Zap" },
  { name: "Vivienda", icon: "Home" },
  { name: "Educación", icon: "GraduationCap" },
  { name: "Ropa", icon: "Shirt" },
  { name: "Otros gastos", icon: "MoreHorizontal" },
];

async function seedGlobalCategory(name: string, icon: string, kind: TransactionKind) {
  const existing = await prisma.category.findFirst({ where: { userId: null, name, kind } });
  if (existing) {
    await prisma.category.update({ where: { id: existing.id }, data: { icon } });
    return;
  }
  await prisma.category.create({ data: { userId: null, name, icon, kind } });
}

async function main() {
  for (const category of INCOME_CATEGORIES) {
    await seedGlobalCategory(category.name, category.icon, "INCOME");
  }

  for (const category of EXPENSE_CATEGORIES) {
    await seedGlobalCategory(category.name, category.icon, "EXPENSE");
  }

  console.log("Categorías predefinidas cargadas.");
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
