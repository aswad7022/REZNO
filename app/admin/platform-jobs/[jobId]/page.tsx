import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { platformJobAdminContext } from "@/features/platform-jobs/services/admin-context";
import { getPlatformJobDetail } from "@/features/platform-jobs/services/queries";

export default async function PlatformJobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const [access, route] = await Promise.all([requireAdminPermission("PLATFORM_JOBS_VIEW"), params]);
  const job = await getPlatformJobDetail(platformJobAdminContext(access), route.jobId);
  return <>
    <AdminPageHeader title="Platform job detail" description="Safe bounded lifecycle metadata; payload values and lease tokens are never exposed." />
    <Card>
      <CardHeader className="flex-row items-center justify-between"><CardTitle className="font-mono">{job.jobType}</CardTitle><Badge>{job.status}</Badge></CardHeader>
      <CardContent className="grid gap-2 text-sm md:grid-cols-2">
        <p>ID: <span className="font-mono">{job.id}</span></p>
        <p>Version: {job.version}</p>
        <p>Attempts: {job.attemptCount}/{job.maxAttempts}</p>
        <p>Fencing generation: {job.fencingToken}</p>
        <p>Source: {job.source}</p>
        <p>Lease active: {job.lease.active ? "yes" : "no"}</p>
        <p>Available: {job.availableAt}</p>
        <p>Last safe error: {job.lastErrorCode ?? "none"}</p>
      </CardContent>
    </Card>
    <Card className="mt-6"><CardHeader><CardTitle>Attempts</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
      {job.attempts.map((attempt) => <p key={attempt.attemptNumber}>#{attempt.attemptNumber} · {attempt.status} · fence {attempt.fencingToken} · {attempt.errorCode ?? "no error"}</p>)}
      {job.attempts.length === 0 ? <p>No attempts.</p> : null}
    </CardContent></Card>
  </>;
}
