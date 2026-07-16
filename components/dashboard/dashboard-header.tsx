import { Suspense } from "react";
import type { BusinessVertical } from "@prisma/client";

import { Separator } from "@/components/ui/separator";
import { DashboardBreadcrumbs } from "@/components/dashboard/dashboard-breadcrumbs";
import { DashboardBusinessSwitcher } from "@/components/dashboard/dashboard-business-switcher";
import { DashboardLanguageSwitcher } from "@/components/dashboard/dashboard-language-switcher";
import { DashboardMessagesShortcut } from "@/components/dashboard/dashboard-messages-shortcut";
import { DashboardMobileNav } from "@/components/dashboard/dashboard-mobile-nav";
import { DashboardNotifications } from "@/components/dashboard/dashboard-notifications";
import { DashboardSearch } from "@/components/dashboard/dashboard-search";
import { DashboardThemeToggle } from "@/components/dashboard/dashboard-theme-toggle";
import { DashboardUserNav } from "@/components/dashboard/dashboard-user-nav";
import { DashboardCommandTrigger } from "@/components/dashboard/dashboard-command-trigger";
import type { DashboardRole, DashboardUser } from "@/types/dashboard";
import type { DashboardNotification } from "@/features/notifications/types";
import type { DashboardMessagePreview } from "@/features/messages/services/messages";

export function DashboardHeader({
  role,
  user,
  notifications,
  messagesHref,
  unreadMessages,
  messagePreviews,
  isSuperAdmin,
  canAccessAdmin,
  canAccessCustomerDashboard,
  canAccessBusinessDashboard,
  canAccessMessages = true,
  vertical,
  activeBusinessId,
  businesses = [],
}: {
  role: DashboardRole;
  user: DashboardUser;
  notifications: DashboardNotification[];
  messagesHref: string;
  unreadMessages?: number;
  messagePreviews: DashboardMessagePreview[];
  isSuperAdmin?: boolean;
  canAccessAdmin?: boolean;
  canAccessCustomerDashboard?: boolean;
  canAccessBusinessDashboard?: boolean;
  canAccessMessages?: boolean;
  vertical?: BusinessVertical;
  activeBusinessId?: string;
  businesses?: Array<{ id: string; name: string }>;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/82 shadow-sm shadow-slate-950/[0.03] backdrop-blur-xl">
      <div className="flex h-[4.25rem] items-center gap-2 px-4 sm:px-6">
        <DashboardMobileNav
          role={role}
          vertical={vertical}
          canAccessAdmin={canAccessAdmin}
          canAccessCustomerDashboard={canAccessCustomerDashboard}
          canAccessBusinessDashboard={canAccessBusinessDashboard}
        />
        <Separator orientation="vertical" className="h-5 lg:hidden" />
        <div className="hidden min-w-0 flex-1 lg:block">
          <DashboardBreadcrumbs />
        </div>
        <div className="flex flex-1 justify-end gap-1.5 lg:flex-none">
          {role === "customer" ? (
            <div className="hidden md:block">
              <Suspense
                fallback={
                  <div className="h-9 w-72 rounded-lg bg-muted" />
                }
              >
                <DashboardSearch />
              </Suspense>
            </div>
          ) : null}
          {role === "business" ? (
            <DashboardBusinessSwitcher
              activeBusinessId={activeBusinessId}
              businesses={businesses}
            />
          ) : null}
          <DashboardCommandTrigger />
          {canAccessMessages ? (
            <DashboardMessagesShortcut
              href={messagesHref}
              unreadCount={unreadMessages}
              items={messagePreviews}
            />
          ) : null}
          <DashboardNotifications role={role} items={notifications} />
          <DashboardLanguageSwitcher />
          <DashboardThemeToggle />
          <DashboardUserNav
            role={role}
            user={user}
            isSuperAdmin={Boolean(isSuperAdmin)}
            canAccessAdmin={Boolean(canAccessAdmin)}
            canAccessCustomerDashboard={Boolean(canAccessCustomerDashboard)}
            canAccessBusinessDashboard={Boolean(canAccessBusinessDashboard)}
          />
        </div>
      </div>
      <div className="border-t border-border/70 px-4 py-2 lg:hidden">
        <DashboardBreadcrumbs />
      </div>
    </header>
  );
}
