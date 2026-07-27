import Link from "next/link";
import type { PlatformJobStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceState } from "@/components/operations/workspace-surface";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { STAGE_6_ARCHITECTURE } from "@/features/platform-jobs/domain/contracts";
import { platformJobAdminContext } from "@/features/platform-jobs/services/admin-context";
import { listPlatformJobs, listPlatformJobSchedules } from "@/features/platform-jobs/services/queries";

export default async function PlatformJobsPage({ searchParams }: {
  searchParams: Promise<{ cursor?: string | string[]; status?: string | string[] }>;
}) {
  const [access, query] = await Promise.all([requireAdminPermission("PLATFORM_JOBS_VIEW"), searchParams]);
  const context = platformJobAdminContext(access);
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const status = typeof query.status === "string" && [
    "SCHEDULED", "AVAILABLE", "CLAIMED", "RUNNING", "SUCCEEDED",
    "RETRY_WAIT", "FAILED", "DEAD_LETTERED", "CANCELLED",
  ].includes(query.status) ? query.status as PlatformJobStatus : undefined;
  const [jobs, schedules] = await Promise.all([
    listPlatformJobs(context, { cursor, limit: 20, status }),
    listPlatformJobSchedules(context, { limit: 10 }),
  ]);
  return <>
    <AdminPageHeader
      title="Platform jobs"
      description="Bounded PostgreSQL-backed durable execution. Automatic scheduling and always-on workers are not connected."
    />
    <WorkspaceState
      className="mb-6"
      tone="warning"
      title="Stage 6 runtime is not activated"
      description="Code and durable records may be present, but automatic scheduling and always-on workers remain disconnected. Schedule rows below are configuration records, not proof of execution."
    />
    <Card className="mb-6">
      <CardHeader><CardTitle>Runtime truth</CardTitle></CardHeader>
      <CardContent className="grid gap-2 text-sm md:grid-cols-2">
        <p>Durable store: <strong>{STAGE_6_ARCHITECTURE.runtime.durableStore}</strong></p>
        <p>External queue: <strong>{STAGE_6_ARCHITECTURE.runtime.externalQueueProvider}</strong></p>
        <p>Automatic scheduler: <strong>{STAGE_6_ARCHITECTURE.runtime.automaticScheduler}</strong></p>
        <p>Always-on worker: <strong>{STAGE_6_ARCHITECTURE.runtime.alwaysOnWorker}</strong></p>
      </CardContent>
    </Card>
    <section className="space-y-4">
      <h2 className="text-xl font-bold">Recent jobs</h2>
      {jobs.items.map((job) => <Card key={job.id}>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle className="font-mono text-base">{job.jobType}</CardTitle>
          <Badge>{job.status}</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>Attempts {job.attemptCount}/{job.maxAttempts} · priority {job.priority} · {job.source}</p>
          <Button asChild variant="outline"><Link href={`/admin/platform-jobs/${job.id}`}>Safe detail</Link></Button>
        </CardContent>
      </Card>)}
      {jobs.items.length === 0 ? (
        <WorkspaceState
          title="No matching durable jobs"
          description="No job matched this bounded filter. This empty state does not imply that workers are active."
        />
      ) : null}
      {jobs.nextCursor ? <Button asChild variant="outline"><Link href={`/admin/platform-jobs?cursor=${encodeURIComponent(jobs.nextCursor)}${status ? `&status=${status}` : ""}`}>Next</Link></Button> : null}
    </section>
    <section className="mt-8 space-y-4">
      <h2 className="text-xl font-bold">Schedules</h2>
      {schedules.items.map((schedule) => <Card key={schedule.id}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm">
          <p><strong>{schedule.scheduleKey}</strong> · every {schedule.cadenceSeconds}s · next {schedule.nextRunAt}</p>
          <Badge>{schedule.enabled ? "ENABLED" : "DISABLED"}</Badge>
        </CardContent>
      </Card>)}
      {schedules.items.length === 0 ? (
        <WorkspaceState
          title="No schedules are configured"
          description="Gate 6A creates no production schedule rows, and Stage 6 runtime remains inactive."
        />
      ) : null}
    </section>
  </>;
}
