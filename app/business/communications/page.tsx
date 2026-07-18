import { BellRing, MessageCircleMore, RadioTower } from "lucide-react";
import Link from "next/link";

import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BusinessCommunicationsHubPage() {
  return (
    <DashboardShell>
      <DashboardPageHeader
        title="Communications"
        description="Notification Center is operational in Stage 4A. Messaging and outbound delivery remain in their locked later gates."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><BellRing className="size-5 text-primary" /><CardTitle>Notification Center</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Inbox, unread state, archive, filters, preferences, and safe destinations.</p>
            <Button asChild><Link href="/business/notifications">Open Notification Center</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><MessageCircleMore className="size-5" /><CardTitle>Messaging</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Existing messaging remains available. Messaging completion is owned by Stage 4B.</p>
            <Button asChild variant="outline"><Link href="/business/messages">Open messages</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><RadioTower className="size-5" /><CardTitle>Outbound delivery</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Email, push, and provider delivery foundations are deferred to Stage 4C.
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
