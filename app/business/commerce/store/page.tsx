import { randomUUID } from "node:crypto";
import { forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MerchantStoreForm, MerchantStoreLifecycleForms, type StoreFormValue } from "@/features/commerce/components/merchant-store-forms";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";
import { getMerchantStore } from "@/features/commerce/services/store-service";

export default async function MerchantStorePage() {
  const [actor, t] = await Promise.all([requireAuthenticatedMerchantActor(), getTranslations("Commerce")]);
  if (!actor.permissions.includes("STORE_VIEW")) forbidden();
  const view = await getMerchantStore(reference(actor));
  const owner = actor.systemRole === "OWNER" && actor.permissions.includes("STORE_MANAGE");
  const store = view.store;
  const managementStore = owner && store
    ? store as StoreFormValue & {
        readiness: { missing: string[]; ready: boolean };
      }
    : null;
  return (
    <DashboardShell>
      <DashboardPageHeader title={t("storeTitle")} description={t("storeDescription")} />
      {store ? <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle>{store.name}</CardTitle><Badge>{store.status}</Badge></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{t("publicSlug")}: <span dir="ltr">{store.slug}</span></p>
          {managementStore ? <>
            <p>{t("readiness")}: {managementStore.readiness.ready ? t("ready") : t("notReady")}</p>
            {!managementStore.readiness.ready ? <ul className="list-disc ps-5">{managementStore.readiness.missing.map((key) => <li key={key}>{key}</li>)}</ul> : null}
          </> : null}
        </CardContent>
      </Card> : null}
      {owner ? <Card>
        <CardHeader><CardTitle>{store ? t("editStore") : t("createStore")}</CardTitle></CardHeader>
        <CardContent><MerchantStoreForm contextOrganizationId={actor.organizationId} idempotencyKey={randomUUID()} store={managementStore} /></CardContent>
      </Card> : store ? <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("readOnly")}</CardContent></Card> : null}
      {managementStore ? <Card>
        <CardHeader><CardTitle>{t("lifecycle")}</CardTitle></CardHeader>
        <CardContent><MerchantStoreLifecycleForms
          contextOrganizationId={actor.organizationId}
          expectedVersion={managementStore.expectedVersion}
          idempotencyKeys={{ archive: randomUUID(), reopen: randomUUID(), submit: randomUUID() }}
          status={managementStore.status}
          storeId={managementStore.id}
        /></CardContent>
      </Card> : null}
    </DashboardShell>
  );
}

function reference(actor: { membershipId: string; organizationId: string; personId: string }) {
  return { contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId };
}
