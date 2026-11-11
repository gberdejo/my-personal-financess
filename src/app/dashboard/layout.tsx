import { UserButton } from "@clerk/nextjs";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { CreditCardsProvider } from "@/components/finance/credit-cards-context";
import { getCreditCardOptions } from "@/features/cards/queries";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Para el selector "¿Con qué tarjeta?" de los formularios de gasto.
  const cards = await getCreditCardOptions();

  return (
    <CreditCardsProvider cards={cards}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <div className="ml-auto">
              <UserButton />
            </div>
          </header>
          <main className="flex flex-1 flex-col gap-4 p-4">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </CreditCardsProvider>
  );
}
