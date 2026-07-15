import { randomUUID } from "node:crypto";
import Link from "next/link";
import Image from "next/image";
import {
  AlertTriangle,
  CalendarClock,
  CircleDollarSign,
  GitBranch,
  ImageIcon,
  Pencil,
  Sparkles,
} from "lucide-react";
import {
  getFormatter,
  getTranslations,
} from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateServiceForm } from "@/features/services/components/create-service-form";
import { ServiceOperations } from "@/features/services/components/service-operations";
import { getCurrentServiceCatalog } from "@/features/services/services/service-catalog";

export async function ServiceManagementPage({
  editId,
}: {
  editId?: string;
}) {
  const [{ services, branches, categories, members, canEdit, organizationId, organizationName }, t, format] =
    await Promise.all([
      getCurrentServiceCatalog(),
      getTranslations("Services"),
      getFormatter(),
    ]);

  const editableService = editId
    ? services.find((service) => service.id === editId)
    : undefined;

  return (
    <DashboardShell>
      <DashboardPageHeader title={t("title")} description={t("description")} />
      <p className="text-sm text-muted-foreground">{t("activeOrganization", { organization: organizationName })}</p>

      {canEdit && !editableService ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("add")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateServiceForm
              categories={categories}
              idempotencyKey={randomUUID()}
              organizationId={organizationId}
            />
          </CardContent>
        </Card>
      ) : null}

      {canEdit && editableService ? (
        <Card id="service-edit">
          <CardHeader>
            <CardTitle>{t("edit.title")}</CardTitle>
            <CardDescription>{editableService.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateServiceForm
              categories={categories}
              idempotencyKey={randomUUID()}
              organizationId={organizationId}
              service={editableService}
            />
          </CardContent>
        </Card>
      ) : null}

      {services.length === 0 ? (
        <DashboardEmpty
          icon={Sparkles}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {services.map((service) => (
            <Card key={service.id} className="overflow-hidden">
              <div className="relative flex aspect-[16/6] items-center justify-center overflow-hidden bg-gradient-to-br from-primary/15 via-accent/20 to-secondary">
                {service.imageUrl ? (
                  <Image
                    src={service.imageUrl}
                    alt={service.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                  />
                ) : null}
                {!service.imageUrl ? (
                  <ImageIcon className="size-8 text-primary/40" />
                ) : null}
              </div>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>{service.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {service.description}
                  </CardDescription>
                </div>
                <Badge
                  variant={
                    service.status === "ACTIVE" ? "default" : "secondary"
                  }
                >
                  {t(`statuses.${service.status}`)}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {canEdit && service.status !== "ARCHIVED" ? (
                  <ServiceOperations
                    branches={branches}
                    keys={{
                      archive: randomUUID(),
                      assignmentAdd: randomUUID(),
                      assignmentRemove: Object.fromEntries(service.staffAssignments.map((assignment) => [assignment.id, randomUUID()])),
                      lifecycle: randomUUID(),
                      offeringCreate: randomUUID(),
                      offeringRemove: Object.fromEntries(service.offerings.map((offering) => [offering.id, randomUUID()])),
                      offeringUpdate: Object.fromEntries(service.offerings.map((offering) => [offering.id, randomUUID()])),
                    }}
                    members={members}
                    organizationId={organizationId}
                    service={service}
                  />
                ) : null}
                {canEdit ? (
                  <div className="flex flex-wrap gap-2 border-b pb-3">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/business/services?edit=${service.id}#service-edit`}>
                        <Pencil />
                        {t("edit.actions.service")}
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/business/services?edit=${service.id}#service-price`}>
                        <CircleDollarSign />
                        {t("edit.actions.price")}
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/business/services?edit=${service.id}#service-branches`}>
                        <GitBranch />
                        {t("edit.actions.branches")}
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`#service-availability-${service.id}`}>
                        <CalendarClock />
                        {t("edit.actions.availability")}
                      </Link>
                    </Button>
                  </div>
                ) : null}
                {service.offerings.map((offering) => (
                  <div
                    key={offering.branchId}
                    className="rounded-lg border p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium">{offering.branchName}</span>
                      <span className="text-muted-foreground">
                        {t("offering", {
                          price: format.number(Number(offering.price), {
                            maximumFractionDigits: 0,
                          }),
                          duration: offering.durationMinutes,
                        })}
                      </span>
                    </div>
                    {offering.readinessIssue ? (
                      <div className="mt-3 flex flex-col gap-2 rounded-lg bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                          {t(
                            `readiness.${offering.readinessIssue}.description`,
                          )}
                        </p>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                        >
                          <Link
                            href={
                              offering.readinessIssue === "HOURS"
                                ? `/business/manage/locations/${offering.branchId}/hours`
                                : "/business/team"
                            }
                          >
                            {t(
                              `readiness.${offering.readinessIssue}.action`,
                            )}
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
                <div
                  id={`service-availability-${service.id}`}
                  className="scroll-mt-24 rounded-xl border border-primary/15 bg-primary/5 p-4"
                >
                  <p className="font-medium">{t("availability.title")}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {t("availability.branchBased")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {service.offerings
                      .filter((offering) => offering.isAvailable)
                      .map((offering) => (
                        <Button
                          key={offering.branchId}
                          asChild
                          size="sm"
                          variant="outline"
                        >
                          <Link
                            href={`/business/manage/locations/${offering.branchId}/hours`}
                          >
                            {t("availability.editBranch", {
                              branch: offering.branchName,
                            })}
                          </Link>
                        </Button>
                      ))}
                    {service.assignedMemberIds.map((memberId) => (
                      <Button
                        key={memberId}
                        asChild
                        size="sm"
                        variant="outline"
                      >
                        <Link href={`/business/team/${memberId}/availability`}>
                          {t("availability.editEmployee")}
                        </Link>
                      </Button>
                    ))}
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/business/services?edit=${service.id}#service-branches`}>
                        {t("availability.editBranches")}
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
