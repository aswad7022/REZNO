import { Armchair, Building2, Plus } from "lucide-react";

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
import { RestaurantTableForm } from "@/features/restaurants/components/restaurant-forms";
import { getRestaurantTables } from "@/features/restaurants/services/restaurant-management";

export async function RestaurantTablesPage() {
  const { tables, branches, canEdit } = await getRestaurantTables();

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="الطاولات"
        description="إدارة طاولات المطعم أو الكافيه حسب الفرع والمنطقة والسعة."
        actions={
          canEdit ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus />
                  إضافة طاولة
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>إضافة طاولة جديدة</DialogTitle>
                  <DialogDescription>
                    أضف طاولة حقيقية لاستخدامها لاحقًا في حجوزات المطاعم.
                  </DialogDescription>
                </DialogHeader>
                <RestaurantTableForm branches={branches} />
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      {tables.length === 0 ? (
        <DashboardEmpty
          icon={Armchair}
          title="لا توجد طاولات بعد"
          description="أضف أول طاولة حتى تصبح صفحة المطعم جاهزة لمرحلة حجز الطاولات القادمة."
          action={
            canEdit ? (
              <Dialog>
                <DialogTrigger asChild>
                  <Button>
                    <Plus />
                    إضافة طاولة
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>إضافة طاولة جديدة</DialogTitle>
                    <DialogDescription>
                      حدّد الاسم والسعة والمنطقة والفرع إن وجد.
                    </DialogDescription>
                  </DialogHeader>
                  <RestaurantTableForm branches={branches} />
                </DialogContent>
              </Dialog>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tables.map((table) => (
            <Card
              key={table.id}
              className="rezno-card-hover border-primary/10 bg-card/95"
            >
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Armchair className="size-5 text-primary" />
                    {table.name}
                  </CardTitle>
                  {table.code ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {table.code}
                    </p>
                  ) : null}
                </div>
                <Badge variant={table.isActive ? "default" : "secondary"}>
                  {table.isActive ? "نشطة" : "مخفية"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="السعة" value={`${table.capacity}`} />
                  <Info label="المنطقة" value={table.area ?? "—"} />
                  <Info label="الطابق" value={table.floor ?? "—"} />
                  <Info label="الموقع" value={table.positionLabel ?? "—"} />
                </div>
                {table.branch ? (
                  <p className="flex items-center gap-2 rounded-2xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                    <Building2 className="size-4" />
                    {table.branch.name}
                  </p>
                ) : null}
                {canEdit ? (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        تعديل الطاولة
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>تعديل الطاولة</DialogTitle>
                        <DialogDescription>
                          التعديل لا يؤثر على منطق الحجز الحالي.
                        </DialogDescription>
                      </DialogHeader>
                      <RestaurantTableForm branches={branches} table={table} />
                    </DialogContent>
                  </Dialog>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-background/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
