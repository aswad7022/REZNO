import Link from "next/link";
import { forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ShoppingBag, ShieldCheck, Package, ClipboardList, ChartNoAxesCombined } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { hasAnyCommerceCapability } from "@/features/commerce/domain/merchant-access";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";

export default async function BusinessCommercePage() {
  const [actor, t] = await Promise.all([
    requireAuthenticatedMerchantActor(),
    getTranslations("Commerce"),
  ]);
  if (!hasAnyCommerceCapability(actor.permissions)) forbidden();
  const cards = [
    {
      active: actor.permissions.includes("STORE_VIEW"),
      description: actor.storeId ? t("storePresent") : t("storeAbsent"),
      href: "/business/commerce/store",
      icon: ShoppingBag,
      title: t("store"),
    },
    {
      active: actor.systemRole === "OWNER",
      description: t("accessDescription"),
      href: "/business/commerce/access",
      icon: ShieldCheck,
      title: t("access"),
    },
    {
      active: actor.permissions.includes("PRODUCT_VIEW"),
      description: t("productsDescription"),
      href: "/business/commerce/products",
      icon: Package,
      title: t("productsTitle"),
    },
    {
      active: actor.permissions.includes("INVENTORY_VIEW"),
      description: t("inventoryDescription"),
      href: "/business/commerce/inventory",
      icon: Package,
      title: t("inventoryTitle"),
    },
    {
      active: actor.permissions.includes("ORDER_VIEW"),
      description: t("ordersDescription"),
      href: "/business/commerce/orders",
      icon: ClipboardList,
      title: t("ordersFulfillment"),
    },
    {
      active: actor.permissions.includes("REPORTS_VIEW"),
      description: t("reportsDescription"),
      href: "/business/commerce/reports",
      icon: ChartNoAxesCombined,
      title: t("reportsTitle"),
    },
  ];
  return (
    <DashboardShell>
      <DashboardPageHeader title={t("hubTitle")} description={t("hubDescription")} />
      <Card>
        <CardHeader><CardTitle>{t("currentAccess")}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge>{actor.systemRole}</Badge>
          {actor.permissions.map((permission) => <Badge key={permission} variant="secondary">{permission}</Badge>)}
        </CardContent>
      </Card>
      <section className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => <Card key={card.title}>
          <CardHeader className="flex-row items-center gap-3">
            <card.icon className="size-5" aria-hidden="true" />
            <CardTitle>{card.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{card.description}</p>
            {card.active && card.href ? <Button asChild><Link href={card.href}>{t("open")}</Link></Button> : <Badge variant="outline">{t("notAvailable")}</Badge>}
          </CardContent>
        </Card>)}
      </section>
    </DashboardShell>
  );
}
