import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { CommerceDomainError } from "@/features/commerce/domain/errors";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";
import {
  listMerchantProductCategories,
  listMerchantProducts,
  type MerchantProductQuery,
} from "@/features/commerce/services/merchant-product-service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function MerchantProductsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, params, t] = await Promise.all([
    requireAuthenticatedMerchantActor(),
    searchParams,
    getTranslations("Commerce"),
  ]);
  if (!actor.permissions.includes("PRODUCT_VIEW")) forbidden();
  const query = productQuery(params);
  let page;
  let categories;
  try {
    [page, categories] = await Promise.all([
      listMerchantProducts(reference(actor), query),
      listMerchantProductCategories(reference(actor)),
    ]);
  } catch (error) {
    if (error instanceof CommerceDomainError && error.code === "INVALID_CURSOR") notFound();
    throw error;
  }
  return <DashboardShell>
    <DashboardPageHeader
      title={t("productsTitle")}
      description={t("productsDescription")}
      actions={actor.permissions.includes("PRODUCT_CREATE") ? <Button asChild><Link href="/business/commerce/products/new">{t("createProduct")}</Link></Button> : null}
    />
    <Card><CardContent className="pt-6">
      <form className="grid gap-3 md:grid-cols-3" method="get">
        <Input name="q" defaultValue={single(params.q)} placeholder={t("searchProducts")} maxLength={100} />
        <Select name="status" defaultValue={single(params.status)} label={t("allStatuses")} values={["DRAFT", "PUBLISHED", "SUSPENDED", "ARCHIVED"]} />
        <select name="categoryId" defaultValue={single(params.categoryId)} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="">{t("allCategories")}</option>
          {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
        </select>
        <Select name="published" defaultValue={single(params.published)} label={t("allPublishing") } values={["published", "unpublished"]} />
        <Select name="stock" defaultValue={single(params.stock)} label={t("allStock") } values={["in_stock", "out_of_stock"]} />
        <Select name="readiness" defaultValue={single(params.readiness)} label={t("allReadiness") } values={["ready", "issues"]} />
        <Button className="w-fit" type="submit">{t("filter")}</Button>
      </form>
    </CardContent></Card>
    <section className="grid gap-4 md:grid-cols-2">
      {page.data.map((product) => <Card key={product.id}>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <CardTitle>{product.name}</CardTitle><Badge>{product.status}</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{product.category.name} · {product.activeVariantCount} {t("variants")}</p>
          <p>{t("availableStock")}: {product.availableQuantity}</p>
          <p>{t("readiness")}: {product.readiness.ready ? t("ready") : t("notReady")}</p>
          <Button asChild variant="outline"><Link href={`/business/commerce/products/${product.id}`}>{t("open")}</Link></Button>
        </CardContent>
      </Card>)}
    </section>
    {!page.data.length ? <p className="text-sm text-muted-foreground">{t("noProducts")}</p> : null}
    {page.pageInfo.nextCursor ? <Button asChild variant="outline"><Link href={nextHref(params, page.pageInfo.nextCursor)}>{t("next")}</Link></Button> : null}
  </DashboardShell>;
}

function productQuery(params: Record<string, string | string[] | undefined>): MerchantProductQuery {
  return {
    categoryId: optionalUuid(params.categoryId),
    cursor: bounded(single(params.cursor), 2048),
    limit: 20,
    published: optionalEnum(params.published, ["published", "unpublished"]),
    query: bounded(single(params.q)?.trim().toLocaleLowerCase(), 100),
    readiness: optionalEnum(params.readiness, ["ready", "issues"]),
    status: optionalEnum(params.status, ["DRAFT", "PUBLISHED", "SUSPENDED", "ARCHIVED"]),
    stock: optionalEnum(params.stock, ["in_stock", "out_of_stock"]),
  };
}

function Select({ defaultValue, label, name, values }: { defaultValue?: string; label: string; name: string; values: string[] }) {
  return <select name={name} defaultValue={defaultValue} className="h-9 rounded-md border bg-background px-3 text-sm">
    <option value="">{label}</option>{values.map((value) => <option key={value} value={value}>{value}</option>)}
  </select>;
}

function nextHref(params: Record<string, string | string[] | undefined>, cursor: string) {
  const output = new URLSearchParams();
  for (const key of ["q", "status", "categoryId", "published", "stock", "readiness"]) {
    const value = single(params[key]);
    if (value) output.set(key, value);
  }
  output.set("cursor", cursor);
  return `/business/commerce/products?${output}`;
}

function single(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function bounded(value: string | undefined, maximum: number) { return value && value.length <= maximum ? value : undefined; }
function optionalUuid(value: string | string[] | undefined) {
  const item = single(value);
  return item && UUID_PATTERN.test(item) ? item : undefined;
}
function optionalEnum<const T extends string>(value: string | string[] | undefined, values: readonly T[]) {
  const item = single(value);
  return item && values.includes(item as T) ? item as T : undefined;
}
function reference(actor: { membershipId: string; organizationId: string; personId: string }) {
  return { contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId };
}
