import { randomUUID } from "node:crypto";
import { forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MerchantProductForm } from "@/features/commerce/components/merchant-product-forms";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";
import { listMerchantProductCategories } from "@/features/commerce/services/merchant-product-service";

export default async function NewMerchantProductPage() {
  const [actor, t] = await Promise.all([requireAuthenticatedMerchantActor(), getTranslations("Commerce")]);
  if (!actor.permissions.includes("PRODUCT_CREATE")) forbidden();
  const categories = await listMerchantProductCategories(reference(actor));
  return <DashboardShell>
    <DashboardPageHeader title={t("createProduct")} description={t("createProductDescription")} />
    <Card><CardHeader><CardTitle>{t("productProfile")}</CardTitle></CardHeader><CardContent>
      <MerchantProductForm categories={categories} contextOrganizationId={actor.organizationId} idempotencyKey={randomUUID()} />
    </CardContent></Card>
  </DashboardShell>;
}

function reference(actor: { membershipId: string; organizationId: string; personId: string }) {
  return { contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId };
}
