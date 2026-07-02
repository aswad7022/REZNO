import { ImageIcon, Plus, Utensils } from "lucide-react";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MenuCategoryForm,
  MenuItemForm,
} from "@/features/restaurants/components/restaurant-forms";
import { getRestaurantMenu } from "@/features/restaurants/services/restaurant-management";

export async function RestaurantMenuPage() {
  const { categories, canEdit } = await getRestaurantMenu();
  const categoryOptions = categories.map((category) => ({
    id: category.id,
    businessId: category.businessId,
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  }));

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="القائمة"
        description="إدارة أقسام وأصناف قائمة الطعام للمطاعم والكافيهات."
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              <MenuCategoryDialog />
              {categoryOptions.length > 0 ? (
                <MenuItemDialog categories={categoryOptions} />
              ) : null}
            </div>
          ) : null
        }
      />

      {categories.length === 0 ? (
        <DashboardEmpty
          icon={Utensils}
          title="لا توجد أقسام في القائمة"
          description="أضف قسمًا مثل المشروبات أو الأطباق الرئيسية، ثم أضف الأصناف داخله."
          action={canEdit ? <MenuCategoryDialog /> : null}
        />
      ) : (
        <div className="space-y-5">
          {categories.map((category) => (
            <Card
              key={category.id}
              className="overflow-hidden border-primary/10 bg-card/95"
            >
              <CardHeader className="flex-row items-start justify-between gap-3 bg-muted/30">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Utensils className="size-5 text-primary" />
                    {category.name}
                  </CardTitle>
                  {category.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {category.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={category.isActive ? "default" : "secondary"}>
                    {category.isActive ? "نشط" : "مخفي"}
                  </Badge>
                  {canEdit ? (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          تعديل القسم
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>تعديل القسم</DialogTitle>
                          <DialogDescription>
                            ترتيب القسم يتحكم بمكان ظهوره في الصفحة العامة.
                          </DialogDescription>
                        </DialogHeader>
                        <MenuCategoryForm category={category} />
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                {category.items.length === 0 ? (
                  <div className="rounded-3xl border border-dashed bg-muted/20 p-6 text-center">
                    <p className="font-medium">هذا القسم فارغ</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      أضف أول صنف حتى يظهر في قائمة النشاط العامة.
                    </p>
                    {canEdit ? (
                      <div className="mt-4">
                        <MenuItemDialog categories={categoryOptions} />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {category.items.map((item) => (
                      <Card
                        key={item.id}
                        className="rezno-card-hover border-primary/10"
                      >
                        <CardContent className="flex gap-4 p-4">
                          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/10 text-primary">
                            <ImageIcon className="size-6" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="font-semibold">{item.name}</h3>
                                {item.description ? (
                                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                    {item.description}
                                  </p>
                                ) : null}
                              </div>
                              <Badge variant={item.isAvailable ? "default" : "secondary"}>
                                {item.isAvailable ? "متاح" : "غير متاح"}
                              </Badge>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                              <strong>
                                {Number(item.price).toLocaleString("ar-IQ")}{" "}
                                {item.currency}
                              </strong>
                              {item.preparationMinutes ? (
                                <span className="text-muted-foreground">
                                  {item.preparationMinutes} دقيقة
                                </span>
                              ) : null}
                            </div>
                            {canEdit ? (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-3 w-full"
                                  >
                                    تعديل الصنف
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                  <DialogHeader>
                                    <DialogTitle>تعديل الصنف</DialogTitle>
                                    <DialogDescription>
                                      حدّث بيانات الصنف وحالته في القائمة.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <MenuItemForm
                                    categories={categoryOptions}
                                    item={item}
                                  />
                                </DialogContent>
                              </Dialog>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}

function MenuCategoryDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          إضافة قسم
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>إضافة قسم للقائمة</DialogTitle>
          <DialogDescription>
            مثال: مشروبات، حلويات، أطباق رئيسية.
          </DialogDescription>
        </DialogHeader>
        <MenuCategoryForm />
      </DialogContent>
    </Dialog>
  );
}

function MenuItemDialog({
  categories,
}: {
  categories: Array<{ id: string; name: string; businessId: string; description: string | null; sortOrder: number; isActive: boolean; createdAt: Date; updatedAt: Date }>;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus />
          إضافة صنف
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>إضافة صنف للقائمة</DialogTitle>
          <DialogDescription>
            أضف السعر والصورة وحالة توفر الصنف.
          </DialogDescription>
        </DialogHeader>
        <MenuItemForm categories={categories} />
      </DialogContent>
    </Dialog>
  );
}
