import { randomUUID } from "node:crypto";
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
  RestaurantCatalogLifecycleForm,
} from "@/features/restaurants/components/restaurant-forms";
import { getRestaurantMenu } from "@/features/restaurants/services/restaurant-management";

export async function RestaurantMenuPage({
  showCreateForm = false,
}: {
  showCreateForm?: boolean;
}) {
  const { categories, canEdit, organizationId, organizationName } =
    await getRestaurantMenu();
  const categoryOptions = categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    version: category.version,
  }));

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="القائمة"
        description="إدارة أقسام وأصناف قائمة الطعام للمطاعم والكافيهات."
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              <MenuCategoryDialog contextOrganizationId={organizationId} />
              {categoryOptions.length > 0 ? (
                <MenuItemDialog
                  categories={categoryOptions}
                  contextOrganizationId={organizationId}
                />
              ) : null}
            </div>
          ) : null
        }
      />

      <p className="rounded-2xl border bg-muted/30 px-4 py-3 text-sm">
        النشاط النشط: <strong>{organizationName}</strong>
      </p>

      {canEdit && showCreateForm ? (
        <Card>
          <CardHeader>
            <CardTitle>إضافة قسم للقائمة</CardTitle>
          </CardHeader>
          <CardContent>
            <MenuCategoryForm
              contextOrganizationId={organizationId}
              idempotencyKey={randomUUID()}
            />
          </CardContent>
        </Card>
      ) : null}

      {categories.length === 0 ? (
        <DashboardEmpty
          icon={Utensils}
          title="لا توجد أقسام في القائمة"
          description="أضف قسمًا مثل المشروبات أو الأطباق الرئيسية، ثم أضف الأصناف داخله."
          action={
            canEdit ? (
              <MenuCategoryDialog contextOrganizationId={organizationId} />
            ) : null
          }
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
                        <MenuCategoryForm
                          category={category}
                          contextOrganizationId={organizationId}
                          idempotencyKey={randomUUID()}
                        />
                      </DialogContent>
                    </Dialog>
                  ) : null}
                  {canEdit && category.version ? (
                    <CatalogLifecycleDialog
                      description="إخفاء القسم يمنعه من الظهور في اكتشاف الطلبات الجديدة ولا يغيّر اللقطات التاريخية."
                      title={category.isActive ? "تعطيل القسم؟" : "تفعيل القسم؟"}
                      trigger={category.isActive ? "تعطيل" : "تفعيل"}
                    >
                      <RestaurantCatalogLifecycleForm
                        action="category-active"
                        active={!category.isActive}
                        contextOrganizationId={organizationId}
                        expectedVersion={category.version}
                        id={category.id}
                        idempotencyKey={randomUUID()}
                        label={category.isActive ? "تأكيد التعطيل" : "تأكيد التفعيل"}
                      />
                    </CatalogLifecycleDialog>
                  ) : null}
                  {canEdit && category.version ? (
                    <CatalogLifecycleDialog
                      description="يُرفض الحذف ما دام القسم يحتوي على أصناف."
                      title="حذف القسم نهائيًا؟"
                      trigger="حذف"
                    >
                      <RestaurantCatalogLifecycleForm
                        action="category-remove"
                        contextOrganizationId={organizationId}
                        expectedVersion={category.version}
                        id={category.id}
                        idempotencyKey={randomUUID()}
                        label="تأكيد الحذف"
                      />
                    </CatalogLifecycleDialog>
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
                        <MenuItemDialog
                          categories={categoryOptions}
                          contextOrganizationId={organizationId}
                        />
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
                                    contextOrganizationId={organizationId}
                                    idempotencyKey={randomUUID()}
                                    item={item}
                                  />
                                </DialogContent>
                              </Dialog>
                            ) : null}
                            {canEdit && item.version ? (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <CatalogLifecycleDialog
                                  description="سيبقى الصنف ظاهرًا في الحجوزات التاريخية، لكنه لن يُعرض للطلبات الجديدة."
                                  title={item.isAvailable ? "إيقاف توفر الصنف؟" : "إتاحة الصنف؟"}
                                  trigger={item.isAvailable ? "غير متاح" : "إتاحة"}
                                >
                                  <RestaurantCatalogLifecycleForm
                                    action="item-available"
                                    active={!item.isAvailable}
                                    contextOrganizationId={organizationId}
                                    expectedVersion={item.version}
                                    id={item.id}
                                    idempotencyKey={randomUUID()}
                                    label={item.isAvailable ? "تأكيد الإيقاف" : "تأكيد الإتاحة"}
                                  />
                                </CatalogLifecycleDialog>
                                <CatalogLifecycleDialog
                                  description="يُرفض الحذف إذا استُخدم الصنف في أي طلب مسبق؛ استخدم عدم الإتاحة حينها."
                                  title="حذف الصنف نهائيًا؟"
                                  trigger="حذف"
                                >
                                  <RestaurantCatalogLifecycleForm
                                    action="item-remove"
                                    contextOrganizationId={organizationId}
                                    expectedVersion={item.version}
                                    id={item.id}
                                    idempotencyKey={randomUUID()}
                                    label="تأكيد الحذف"
                                  />
                                </CatalogLifecycleDialog>
                              </div>
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

function MenuCategoryDialog({
  contextOrganizationId,
}: {
  contextOrganizationId: string;
}) {
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
        <MenuCategoryForm
          contextOrganizationId={contextOrganizationId}
          idempotencyKey={randomUUID()}
        />
      </DialogContent>
    </Dialog>
  );
}

function MenuItemDialog({
  categories,
  contextOrganizationId,
}: {
  categories: Array<{
    id: string;
    name: string;
    description: string | null;
    sortOrder: number;
    isActive: boolean;
    version?: string;
  }>;
  contextOrganizationId: string;
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
        <MenuItemForm
          categories={categories}
          contextOrganizationId={contextOrganizationId}
          idempotencyKey={randomUUID()}
        />
      </DialogContent>
    </Dialog>
  );
}

function CatalogLifecycleDialog({
  children,
  description,
  title,
  trigger,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
  trigger: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">{trigger}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
