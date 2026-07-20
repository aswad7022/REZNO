import { randomUUID } from "node:crypto";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  MerchantProductForm,
  ProductLifecycleForms,
  ProductVariantForms,
  type ProductEditorValue,
} from "@/features/commerce/components/merchant-product-forms";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";
import {
  getMerchantProduct,
  listMerchantProductCategories,
} from "@/features/commerce/services/merchant-product-service";
import { MediaManager } from "@/features/media/components/media-manager";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function MerchantProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const [actor, route, t, mediaT] = await Promise.all([
    requireAuthenticatedMerchantActor(),
    params,
    getTranslations("Commerce"),
    getTranslations("Media"),
  ]);
  if (!actor.permissions.includes("PRODUCT_VIEW")) forbidden();
  if (!UUID_PATTERN.test(route.productId)) notFound();
  const [view, categories] = await Promise.all([
    getMerchantProduct(reference(actor), route.productId),
    listMerchantProductCategories(reference(actor)),
  ]);
  const product = view.product;
  const management = "media" in product && "expectedVersion" in product
    ? product as ProductEditorValue
    : null;
  const canUpdate = Boolean(management?.permittedActions.update);
  const canManageMedia = (actor.systemRole === "OWNER" || actor.systemRole === "MANAGER")
    && product.status !== "ARCHIVED";
  const mediaVariants = "variants" in product
    ? product.variants.map((variant) => ({ id: variant.id, title: variant.title }))
    : [];
  const hasLifecycleAction = Boolean(
    management && (
      management.permittedActions.archive ||
      management.permittedActions.publish ||
      management.permittedActions.unpublish
    ),
  );
  return <DashboardShell>
    <DashboardPageHeader title={product.name} description={t("productDetailDescription")} />
    <Card><CardHeader className="flex-row items-start justify-between"><CardTitle>{t("productSummary")}</CardTitle><Badge>{product.status}</Badge></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>{product.category.name} · <span dir="ltr">{product.slug}</span></p>
        <p>{t("readiness")}: {product.readiness.ready ? t("ready") : t("notReady")}</p>
        {!product.readiness.ready ? <ul className="list-disc ps-5">{product.readiness.missing.map((key) => <li key={key}>{key}</li>)}</ul> : null}
      </CardContent>
    </Card>
    {management ? <>
      {canUpdate ? <Card><CardHeader><CardTitle>{t("productProfile")}</CardTitle></CardHeader><CardContent><MerchantProductForm categories={categories} contextOrganizationId={actor.organizationId} idempotencyKey={randomUUID()} product={management} /></CardContent></Card> : null}
      {hasLifecycleAction ? <Card><CardHeader><CardTitle>{t("lifecycle")}</CardTitle></CardHeader><CardContent><ProductLifecycleForms contextOrganizationId={actor.organizationId} idempotencyKeys={randomKeys(3)} product={management} /></CardContent></Card> : null}
      {canUpdate ? <Card><CardHeader><CardTitle>{t("variants")}</CardTitle></CardHeader><CardContent><ProductVariantForms contextOrganizationId={actor.organizationId} idempotencyKeys={randomKeys(management.variants.length * 3 + 1)} product={management} /></CardContent></Card> : null}
      {!canUpdate ? <Card><CardContent className="space-y-4 pt-6">
        <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
        {management.variants.map((variant) => <div key={variant.id} className="rounded-xl border p-3 text-sm">{variant.title} · {variant.sku} · {variant.status}</div>)}
      </CardContent></Card> : null}
    </> : <Card><CardContent className="space-y-4 pt-6">
      <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
      {"variants" in product ? product.variants.map((variant) => <div key={variant.id} className="rounded-xl border p-3 text-sm">{variant.title} · {variant.sku} · {variant.status}</div>) : null}
    </CardContent></Card>}
    {canManageMedia ? <Card><CardHeader><CardTitle>{t("productMedia")}</CardTitle></CardHeader><CardContent className="space-y-5">
      <MediaManager collection description={mediaT("altText")} endpoint={`/api/media/business/products/${product.id}`} purpose="PRODUCT_IMAGE" reorderEndpoint={`/api/media/business/products/${product.id}/reorder`} slot="PRODUCT_IMAGE" storageMode="business" title={t("productMedia")} variants={mediaVariants} />
    </CardContent></Card> : null}
  </DashboardShell>;
}

function reference(actor: { membershipId: string; organizationId: string; personId: string }) {
  return { contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId };
}

function randomKeys(count: number) { return Array.from({ length: count }, () => randomUUID()); }
