import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PresupuestosPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Presupuestos</h1>
      <Card>
        <CardHeader>
          <CardTitle>Sin presupuestos todavía</CardTitle>
          <CardDescription>Creá un presupuesto para empezar a hacer seguimiento de tus gastos por categoría.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
