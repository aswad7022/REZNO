"use client";

import { type ReactNode, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { BusinessVertical } from "@prisma/client";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { cn } from "@/lib/utils";
import type { DashboardRole, DashboardUser } from "@/types/dashboard";
import type { DashboardNotification } from "@/features/notifications/types";
import type { DashboardMessagePreview } from "@/features/messages/services/messages";

const SIDEBAR_STORAGE_KEY = "rezno-dashboard-sidebar-collapsed";
const DashboardCommandPalette = dynamic(
  () => import("@/components/dashboard/dashboard-command-palette"),
  { ssr: false },
);

export function DashboardLayout({
  children,
  role,
  user,
  notifications,
  messagesHref,
  unreadMessages,
  messagePreviews,
  isSuperAdmin = false,
  canAccessAdmin = false,
  canAccessCustomerDashboard = false,
  canAccessBusinessDashboard = false,
  publicSlug,
  vertical,
  activeBusinessId,
  businesses = [],
}: {
  children: ReactNode;
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
  publicSlug?: string;
  vertical?: BusinessVertical;
  activeBusinessId?: string;
  businesses?: Array<{ id: string; name: string }>;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setCollapsed((current) => {
          const next = !current;
          localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
          return next;
        });
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, []);

  function updateCollapsed(next: boolean) {
    setCollapsed(next);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
  }

  return (
    <div className="rezno-premium-surface min-h-screen">
      <DashboardCommandPalette role={role} publicSlug={publicSlug} />
      <DashboardSidebar
        role={role}
        vertical={vertical}
        canAccessAdmin={canAccessAdmin}
        canAccessCustomerDashboard={canAccessCustomerDashboard}
        canAccessBusinessDashboard={canAccessBusinessDashboard}
        collapsed={collapsed}
        onCollapsedChange={updateCollapsed}
      />
      <div
        className={cn(
          "min-h-screen transition-[padding] duration-200 ease-out",
          collapsed ? "lg:ps-18" : "lg:ps-64",
        )}
      >
        <DashboardHeader
          role={role}
          vertical={vertical}
          user={user}
          notifications={notifications}
          messagesHref={messagesHref}
          unreadMessages={unreadMessages}
          messagePreviews={messagePreviews}
          isSuperAdmin={isSuperAdmin}
          canAccessAdmin={canAccessAdmin}
          canAccessCustomerDashboard={canAccessCustomerDashboard}
          canAccessBusinessDashboard={canAccessBusinessDashboard}
          activeBusinessId={activeBusinessId}
          businesses={businesses}
        />
        <main id="main-content">{children}</main>
      </div>
    </div>
  );
}
