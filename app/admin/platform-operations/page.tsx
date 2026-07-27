import { randomUUID } from "node:crypto";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  WorkspaceMetricGrid,
  WorkspaceState,
} from "@/components/operations/workspace-surface";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { platformJobAdminContext } from "@/features/platform-jobs/services/admin-context";
import {
  acknowledgePlatformAlertAction,
  acknowledgePlatformIncidentAction,
  bootstrapPlatformSchedulesAction,
  createPlatformIncidentAction,
  initializePlatformRuntimeAction,
  resolvePlatformAlertAction,
  resolvePlatformIncidentAction,
  setPlatformRuntimeStateAction,
} from "@/features/platform-operations/actions/admin-platform-operations";
import {
  getPlatformOperationsOverview,
  listPlatformAlerts,
  listPlatformIncidents,
} from "@/features/platform-operations/services/queries";

export default async function PlatformOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    alertCursor?: string | string[];
    incidentCursor?: string | string[];
  }>;
}) {
  const [access, query] = await Promise.all([
    requireAdminPermission("PLATFORM_OPERATIONS_VIEW"),
    searchParams,
  ]);
  const context = platformJobAdminContext(access);
  const canManage = access.isSuperAdmin
    || access.permissions.includes("PLATFORM_OPERATIONS_MANAGE");
  const canManageJobs = access.isSuperAdmin
    || access.permissions.includes("PLATFORM_JOBS_MANAGE");
  const canViewJobs = access.isSuperAdmin
    || access.permissions.includes("PLATFORM_JOBS_VIEW");
  const alertCursor = typeof query.alertCursor === "string"
    ? query.alertCursor
    : undefined;
  const incidentCursor = typeof query.incidentCursor === "string"
    ? query.incidentCursor
    : undefined;
  const [overview, alerts, incidents] = await Promise.all([
    getPlatformOperationsOverview(context),
    listPlatformAlerts(context, { cursor: alertCursor, limit: 20 }),
    listPlatformIncidents(context, { cursor: incidentCursor, limit: 20 }),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Platform operations"
        description="Automatic runtime, bounded health signals, alerts, and incidents backed by PostgreSQL."
      />
      <WorkspaceState
        className="mb-6"
        tone={overview.runtime.state === "ENABLED" ? "warning" : "info"}
        title={`Runtime state: ${overview.runtime.state}`}
        description={
          overview.runtime.state === "ENABLED"
            ? "The database reports an enabled runtime. Confirm deployment connectivity before treating any scheduler or worker as active."
            : "Stage 6 runtime is not activated. Stored jobs, schedules, and health records do not prove that automatic execution is connected."
        }
      />
      <WorkspaceMetricGrid>
        {Object.entries(overview.metrics).map(([name, value]) => (
          <Card key={name}>
            <CardHeader>
              <CardTitle className="text-sm">{name}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {value.count}{value.saturated ? "+" : ""}
            </CardContent>
          </Card>
        ))}
      </WorkspaceMetricGrid>

      <div className="my-6">
        <WorkspaceMetricGrid>
        <TruthCard
          label="Distributed rate limit"
          value={`${overview.rateLimit.backend} · ${overview.rateLimit.availability} · FAIL_${overview.rateLimit.failMode}`}
        />
        <TruthCard
          label="Communications provider"
          value={overview.providers.communications}
        />
        <TruthCard
          label="Payment provider"
          value={overview.providers.payment}
        />
        <TruthCard
          label="Storage provider"
          value={overview.providers.storage}
        />
        </WorkspaceMetricGrid>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Automatic runtime</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>{overview.runtime.state}</Badge>
            <Badge>{overview.runtime.connection}</Badge>
            <span>Last invocation: {overview.runtime.lastInvocationAt ?? "never"}</span>
            <span>Last success: {overview.runtime.lastSucceededAt ?? "never"}</span>
          </div>
          {canManage && !overview.runtime.configured ? (
            <form action={initializePlatformRuntimeAction}>
              <input name="idempotencyKey" type="hidden" value={randomUUID()} />
              <Button type="submit">Initialize disabled runtime</Button>
            </form>
          ) : null}
          {canManage && overview.runtime.configured && overview.runtime.version ? (
            <form action={setPlatformRuntimeStateAction}>
              <input name="idempotencyKey" type="hidden" value={randomUUID()} />
              <input name="expectedVersion" type="hidden" value={overview.runtime.version} />
              <input
                name="enabled"
                type="hidden"
                value={overview.runtime.state === "ENABLED" ? "false" : "true"}
              />
              <Button type="submit" variant={overview.runtime.state === "ENABLED" ? "destructive" : "default"}>
                {overview.runtime.state === "ENABLED" ? "Disable runtime" : "Enable runtime"}
              </Button>
            </form>
          ) : null}
          {canManage && canManageJobs ? (
            <form action={bootstrapPlatformSchedulesAction}>
              <input name="idempotencyKey" type="hidden" value={randomUUID()} />
              <Button type="submit" variant="outline">
                Bootstrap 13 disabled schedules
              </Button>
            </form>
          ) : null}
          {canViewJobs ? (
            <Button asChild variant="outline">
              <Link href="/admin/platform-jobs">
                Open durable jobs and schedules
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">Alerts</h2>
        {alerts.items.map((alert) => (
          <Card key={alert.id}>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">{alert.summaryCode}</CardTitle>
              <div className="flex gap-2">
                <Badge>{alert.severity}</Badge>
                <Badge>{alert.state}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                {alert.domain} · {alert.rule} · occurrences {alert.occurrenceCount}
              </p>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  {alert.state === "OPEN" ? (
                    <OperationForm
                      action={acknowledgePlatformAlertAction}
                      field="alertId"
                      id={alert.id}
                      label="Acknowledge"
                      version={alert.version}
                    />
                  ) : null}
                  {alert.state !== "RESOLVED" ? (
                    <OperationForm
                      action={resolvePlatformAlertAction}
                      field="alertId"
                      id={alert.id}
                      label="Resolve"
                      version={alert.version}
                    />
                  ) : null}
                  {alert.incidentId ? null : (
                    <OperationForm
                      action={createPlatformIncidentAction}
                      field="alertId"
                      id={alert.id}
                      label="Create incident"
                      version={alert.version}
                    />
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {alerts.items.length === 0 ? (
          <WorkspaceState
            title="No platform alerts"
            description="No alert matched the current bounded view."
          />
        ) : null}
        {alerts.nextCursor ? (
          <Button asChild variant="outline">
            <Link href={`/admin/platform-operations?alertCursor=${encodeURIComponent(alerts.nextCursor)}`}>
              Next alerts
            </Link>
          </Button>
        ) : null}
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-bold">Incidents</h2>
        {incidents.items.map((incident) => (
          <Card key={incident.id}>
            <CardContent className="space-y-3 pt-6 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p><strong>{incident.summaryCode}</strong> · {incident.domain}</p>
                <div className="flex gap-2">
                  <Badge>{incident.severity}</Badge>
                  <Badge>{incident.state}</Badge>
                </div>
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  {incident.state === "OPEN" ? (
                    <OperationForm
                      action={acknowledgePlatformIncidentAction}
                      field="incidentId"
                      id={incident.id}
                      label="Acknowledge"
                      version={incident.version}
                    />
                  ) : null}
                  {incident.state !== "RESOLVED" ? (
                    <OperationForm
                      action={resolvePlatformIncidentAction}
                      field="incidentId"
                      id={incident.id}
                      label="Resolve"
                      version={incident.version}
                    />
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {incidents.items.length === 0 ? (
          <WorkspaceState
            title="No platform incidents"
            description="No incident matched the current bounded view."
          />
        ) : null}
        {incidents.nextCursor ? (
          <Button asChild variant="outline">
            <Link href={`/admin/platform-operations?incidentCursor=${encodeURIComponent(incidents.nextCursor)}`}>
              Next incidents
            </Link>
          </Button>
        ) : null}
      </section>
    </>
  );
}

function TruthCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <Badge>{value}</Badge>
      </CardContent>
    </Card>
  );
}

function OperationForm({
  action,
  field,
  id,
  label,
  version,
}: {
  action: (formData: FormData) => Promise<void>;
  field: "alertId" | "incidentId";
  id: string;
  label: string;
  version: number;
}) {
  return (
    <form action={action}>
      <input name={field} type="hidden" value={id} />
      <input name="expectedVersion" type="hidden" value={version} />
      <input name="idempotencyKey" type="hidden" value={randomUUID()} />
      <Button size="sm" type="submit" variant="outline">{label}</Button>
    </form>
  );
}
