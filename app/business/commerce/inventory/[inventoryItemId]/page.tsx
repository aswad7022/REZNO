import { randomUUID } from "node:crypto";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MerchantInventoryForms } from "@/features/commerce/components/merchant-inventory-forms";
import { CommerceDomainError } from "@/features/commerce/domain/errors";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";
import { getMerchantInventoryDetail } from "@/features/commerce/services/merchant-inventory-service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function MerchantInventoryDetailPage({ params, searchParams }: {
  params: Promise<{ inventoryItemId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, route, query, t] = await Promise.all([requireAuthenticatedMerchantActor(), params, searchParams, getTranslations("Commerce")]);
  if (!actor.permissions.includes("INVENTORY_VIEW")) forbidden();
  if (!UUID_PATTERN.test(route.inventoryItemId)) notFound();
  const cursor = typeof query.cursor === "string" && query.cursor.length <= 2048 ? query.cursor : undefined;
  let view;
  try {
    view = await getMerchantInventoryDetail(reference(actor), route.inventoryItemId, { cursor, limit: 20 });
  } catch (error) {
    if (error instanceof CommerceDomainError && error.code === "INVALID_CURSOR") notFound();
    throw error;
  }
  const item = view.inventory;
  return <DashboardShell>
    <DashboardPageHeader title={item.product.name} description={t("inventoryDetailDescription")} />
    <Card><CardHeader className="flex-row items-start justify-between"><CardTitle>{item.variant.title}</CardTitle>{item.lowStock ? <Badge variant="destructive">{t("lowStock")}</Badge> : <Badge>{item.variant.status}</Badge>}</CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p dir="ltr">{item.variant.sku}</p>
        <p>{t("onHand")}: {item.onHand} · {t("reserved")}: {item.reserved} · {t("availableStock")}: {item.available}</p>
        <p>{t("lowStockThreshold")}: {item.lowStockThreshold ?? "—"} · {t("version")}: {item.version}</p>
      </CardContent>
    </Card>
    {view.permittedActions.adjust ? <Card><CardHeader><CardTitle>{t("inventoryActions")}</CardTitle></CardHeader><CardContent><MerchantInventoryForms contextOrganizationId={actor.organizationId} idempotencyKeys={{ adjust: randomUUID(), threshold: randomUUID() }} inventory={item} /></CardContent></Card> : null}
    <Card><CardHeader><CardTitle>{t("movementHistory")}</CardTitle></CardHeader><CardContent className="space-y-3">
      {view.movements.data.map((movement) => <div className="rounded-xl border p-3 text-sm" key={movement.id}>
        <p>{movement.type} · {movement.onHandDelta > 0 ? "+" : ""}{movement.onHandDelta} · {movement.reason}</p>
        <p className="text-muted-foreground">{movement.createdAt} · {movement.resultingOnHand}</p>
      </div>)}
      {!view.movements.data.length ? <p className="text-sm text-muted-foreground">{t("noMovements")}</p> : null}
      {view.movements.pageInfo.nextCursor ? <Button asChild variant="outline"><Link href={`/business/commerce/inventory/${item.id}?cursor=${encodeURIComponent(view.movements.pageInfo.nextCursor)}`}>{t("next")}</Link></Button> : null}
    </CardContent></Card>
  </DashboardShell>;
}

function reference(actor: { membershipId: string; organizationId: string; personId: string }) { return { contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId }; }
