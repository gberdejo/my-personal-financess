import type { LucideIcon } from "lucide-react";
import { ArrowLeftRight, CalendarDays, LayoutDashboard, PiggyBank, Tags, Wallet } from "lucide-react";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { title: "Resumen", url: "/dashboard", icon: LayoutDashboard },
  { title: "Transacciones", url: "/dashboard/transacciones", icon: ArrowLeftRight },
  { title: "Calendario", url: "/dashboard/calendario", icon: CalendarDays },
  { title: "Presupuestos", url: "/dashboard/presupuestos", icon: PiggyBank },
  { title: "Categorías", url: "/dashboard/categorias", icon: Tags },
  { title: "Cuentas", url: "/dashboard/cuentas", icon: Wallet },
];
