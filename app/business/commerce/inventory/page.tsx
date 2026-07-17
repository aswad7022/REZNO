import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { CommerceDomainError } from "@/features/commerce/domain/errors";
import { serializeInventorySummary } from "@/features/commerce/domain/product-dto";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";
import { listMerchantInventory, type MerchantInventoryQuery } from "@/features/commerce/services/merchant-inventory-service";

export default async function MerchantInventoryPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, params, t] = await Promise.all([requireAuthenticatedMerchantActor(), searchParams, getTranslations("Commerce")]);
  if (!actor.permissions.includes("INVENTORY_VIEW")) forbidden();
  let page;
  try {
    page = await listMerchantInventory(reference(actor), inventoryQuery(params));
  } catch (error) {
    if (error instanceof CommerceDomainError && error.code === "INVALID_CURSOR") notFound();
    throw error;
  }
  const data = page.data.map(serializeInventorySummary);
  return <DashboardShell>
    <DashboardPageHeader title={t("inventoryTitle")} description={t("inventoryDescription")} />
    <Card><CardContent className="pt-6"><form method="get" className="grid gap-3 md:grid-cols-3">
      <Input name="q" defaultValue={single(params.q)} placeholder={t("searchInventory")} maxLength={100} />
      <Select name="availability" defaultValue={single(params.availability)} label={t("allStock")} values={["in_stock", "out_of_stock"]} />
      <Select name="lowStock" defaultValue={single(params.lowStock)} label={t("allLowStock")} values={["true", "false"]} />
      <Select name="productStatus" defaultValue={single(params.productStatus)} label={t("allStatuses")} values={["DRAFT", "PUBLISHED", "SUSPENDED", "ARCHIVED"]} />
      <Select name="variantStatus" defaultValue={single(params.variantStatus)} label={t("allVariantStatuses")} values={["ACTIVE", "INACTIVE", "ARCHIVED"]} />
      <Button className="w-fit" type="submit">{t("filter")}</Button>
    </form></CardContent></Card>
    <section className="grid gap-4 md:grid-cols-2">
      {data.map((item) => <Card key={item.id}>
        <CardHeader className="flex-row items-start justify-between"><CardTitle>{item.product.name}</CardTitle>{item.lowStock ? <Badge variant="destructive">{t("lowStock")}</Badge> : <Badge>{item.variant.status}</Badge>}</CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{item.variant.title} · <span dir="ltr">{item.variant.sku}</span></p>
          <p>{t("onHand")}: {item.onHand} · {t("reserved")}: {item.reserved} · {t("availableStock")}: {item.available}</p>
          <Button asChild variant="outline"><Link href={`/business/commerce/inventory/${item.id}`}>{t("open")}</Link></Button>
        </CardContent>
      </Card>)}
    </section>
    {!data.length ? <p className="text-sm text-muted-foreground">{t("noInventory")}</p> : null}
    {page.pageInfo.nextCursor ? <Button asChild variant="outline"><Link href={nextHref(params, page.pageInfo.nextCursor)}>{t("next")}</Link></Button> : null}
  </DashboardShell>;
}

function inventoryQuery(params: Record<string, string | string[] | undefined>): MerchantInventoryQuery {
  const lowStock = single(params.lowStock);
  return {
    availability: optionalEnum(params.availability, ["in_stock", "out_of_stock"]),
    cursor: bounded(single(params.cursor), 2048),
    limit: 20,
    lowStock: lowStock === "true" ? true : lowStock === "false" ? false : undefined,
    productStatus: optionalEnum(params.productStatus, ["DRAFT", "PUBLISHED", "SUSPENDED", "ARCHIVED"]),
    query: bounded(single(params.q)?.trim(), 100),
    variantStatus: optionalEnum(params.variantStatus, ["ACTIVE", "INACTIVE", "ARCHIVED"]),
  };
}
function Select({ defaultValue, label, name, values }: { defaultValue?: string; label: string; name: string; values: string[] }) {
  return <select name={name} defaultValue={defaultValue} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">{label}</option>{values.map((value) => <option key={value} value={value}>{value}</option>)}</select>;
}
function nextHref(params: Record<string, string | string[] | undefined>, cursor: string) {
  const output = new URLSearchParams();
  for (const key of ["q", "availability", "lowStock", "productStatus", "variantStatus"]) { const value = single(params[key]); if (value) output.set(key, value); }
  output.set("cursor", cursor);
  return `/business/commerce/inventory?${output}`;
}
function single(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function bounded(value: string | undefined, maximum: number) { return value && value.length <= maximum ? value : undefined; }
function optionalEnum<const T extends string>(value: string | string[] | undefined, values: readonly T[]) { const item = single(value); return item && values.includes(item as T) ? item as T : undefined; }
function reference(actor: { membershipId: string; organizationId: string; personId: string }) { return { contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId }; }
