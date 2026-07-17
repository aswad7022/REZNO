import { randomUUID } from "node:crypto";
import { forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { CommerceAccessForm } from "@/features/commerce/components/commerce-access-form";
import { canManageCommerceAccess } from "@/features/commerce/domain/merchant-access";
import { listCommerceAccessRoles } from "@/features/commerce/services/commerce-access-service";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";

export default async function CommerceAccessPage() {
  const [actor, t] = await Promise.all([requireAuthenticatedMerchantActor(), getTranslations("Commerce")]);
  if (!canManageCommerceAccess(actor.systemRole)) forbidden();
  const view = await listCommerceAccessRoles({
    contextOrganizationId: actor.organizationId,
    membershipId: actor.membershipId,
    personId: actor.personId,
  });
  return (
    <DashboardShell>
      <DashboardPageHeader title={t("accessTitle")} description={t("accessPageDescription")} />
      <div className="space-y-4">
        {view.roles.map((role) => <CommerceAccessForm key={role.id} contextOrganizationId={actor.organizationId} idempotencyKey={randomUUID()} role={role} />)}
      </div>
    </DashboardShell>
  );
}
