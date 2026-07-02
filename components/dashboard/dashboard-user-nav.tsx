"use client";

import Link from "next/link";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth/client";
import type { DashboardRole, DashboardUser } from "@/types/dashboard";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function DashboardUserNav({
  role,
  user,
  isSuperAdmin = false,
  canAccessAdmin = false,
}: {
  role: DashboardRole;
  user: DashboardUser;
  isSuperAdmin?: boolean;
  canAccessAdmin?: boolean;
}) {
  const t = useTranslations("Dashboard");
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    const result = await authClient.signOut();
    if (result.error) {
      setSigningOut(false);
      return;
    }
    window.location.replace("/register?mode=signin");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none transition-transform hover:scale-[1.03] focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={t("openUserMenu")}
      >
        <Avatar className="size-9 border border-border shadow-sm">
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback>{getInitials(user.name) || "RU"}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 rounded-2xl border-primary/10 shadow-2xl shadow-slate-950/10"
      >
        <DropdownMenuLabel>
          <span className="block truncate text-sm text-foreground">
            {user.name}
          </span>
          <span className="block truncate text-xs font-normal">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={`/${role}/profile`}>
              <UserRound />
              {t("navigation.items.profile")}
            </Link>
          </DropdownMenuItem>
          {canAccessAdmin ? (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <ShieldCheck />
                {isSuperAdmin ? t("superAdminDashboard") : t("adminDashboard")}
              </Link>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={signingOut}
          onSelect={signOut}
        >
          <LogOut />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
