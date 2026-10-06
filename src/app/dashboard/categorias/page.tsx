import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryReasonsEditor } from "@/components/finance/category-reasons-editor";
import { EditCategoryDialog } from "@/components/finance/edit-category-dialog";
import { requireUserId } from "@/lib/auth";
import { getAllCategories } from "@/features/categories/queries";
import { TRANSACTION_KIND_LABELS } from "@/lib/labels";
import type { TransactionKind } from "@/generated/prisma/client";

export default async function CategoriasPage() {
  const [userId, categories] = await Promise.all([requireUserId(), getAllCategories()]);

  const groups: { kind: TransactionKind; items: typeof categories }[] = (
    ["EXPENSE", "INCOME"] as const
  ).map((kind) => ({ kind, items: categories.filter((c) => c.kind === kind) }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-medium italic md:text-3xl">Categorías</h1>
        <p className="text-sm text-muted-foreground">
          Los motivos de cada categoría aparecen como sugerencias al registrar un movimiento, para escribirlos
          siempre igual.
        </p>
      </div>

      {categories.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sin categorías todavía</CardTitle>
            <CardDescription>Las categorías se crean al registrar un movimiento.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        groups.map(
          (group) =>
            group.items.length > 0 && (
              <div key={group.kind} className="flex flex-col gap-3">
                <h2 className="text-sm font-medium text-muted-foreground">
                  {TRANSACTION_KIND_LABELS[group.kind]}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((category) => (
                    <Card key={category.id}>
                      <CardHeader className="flex flex-row items-center justify-between gap-2">
                        <CardTitle className="text-base">{category.name}</CardTitle>
                        {category.userId === userId ? (
                          <EditCategoryDialog categoryId={category.id} currentName={category.name} />
                        ) : (
                          <span className="text-xs text-muted-foreground">Global</span>
                        )}
                      </CardHeader>
                      <CardContent>
                        <CategoryReasonsEditor categoryId={category.id} reasons={category.reasons} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ),
        )
      )}
    </div>
  );
}
