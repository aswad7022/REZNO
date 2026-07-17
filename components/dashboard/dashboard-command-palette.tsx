"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  Bell,
  Armchair,
  Building2,
  CalendarDays,
  CalendarPlus,
  ChartNoAxesCombined,
  ClipboardCopy,
  Clock3,
  ExternalLink,
  Heart,
  LayoutDashboard,
  Map,
  Menu,
  PanelsTopLeft,
  Plus,
  Settings,
  Sparkles,
  UserPlus,
  UsersRound,
  ShoppingBag,
} from "lucide-react";
import type { BusinessVertical, CommercePermission, SystemRole } from "@prisma/client";
import { useTranslations } from "next-intl";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import type { DashboardRole } from "@/types/dashboard";
import { getDashboardNavigation } from "@/features/dashboard/navigation";

const RECENT_KEY = "rezno-command-palette-recent";

type CommandDefinition = {
  id: string;
  labelKey:
    | "business.dashboard"
    | "business.bookings"
    | "business.calendar"
    | "business.reservations"
    | "business.tables"
    | "business.menu"
    | "business.analytics"
    | "business.audit"
    | "business.availability"
    | "business.services"
    | "business.team"
    | "business.publicProfile"
    | "business.profile"
    | "business.notifications"
    | "business.settings"
    | "business.commerce"
    | "business.commerceStore"
    | "business.commerceAccess"
    | "business.commerceProducts"
    | "business.commerceInventory"
    | "customer.dashboard"
    | "customer.marketplace"
    | "customer.bookings"
    | "customer.favorites"
    | "customer.notifications"
    | "actions.addService"
    | "actions.addEmployee"
    | "actions.openPublic"
    | "actions.copyPublic"
    | "actions.createBooking";
  group: "navigation" | "actions";
  href?: string;
  action?: "open-public" | "copy-public";
  icon: typeof LayoutDashboard;
  keywords?: string[];
};

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const normalized = query.trim();
  if (!normalized) return text;
  const index = text.toLocaleLowerCase().indexOf(normalized.toLocaleLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-primary/15 px-0.5 text-foreground">
        {text.slice(index, index + normalized.length)}
      </mark>
      {text.slice(index + normalized.length)}
    </>
  );
}

export default function DashboardCommandPalette({
  role,
  publicSlug,
  vertical,
  systemRole,
  membershipId,
  canAccessMessages = true,
  commercePermissions = [],
}: {
  role: DashboardRole;
  publicSlug?: string;
  vertical?: BusinessVertical;
  systemRole?: SystemRole | null;
  membershipId?: string;
  canAccessMessages?: boolean;
  commercePermissions?: readonly CommercePermission[];
}) {
  const t = useTranslations("CommandPalette");
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem(`${RECENT_KEY}:${role}`);
    if (!saved) return [];
    try {
      return JSON.parse(saved) as string[];
    } catch {
      localStorage.removeItem(`${RECENT_KEY}:${role}`);
      return [];
    }
  });

  const commands = useMemo<CommandDefinition[]>(() => {
    if (role === "business") {
      const allowedHrefs = new Set(
        getDashboardNavigation(
          role,
          vertical,
          systemRole,
          membershipId,
          canAccessMessages,
          commercePermissions,
        ).flatMap((group) =>
          group.items.flatMap((item) => [
            item.href,
            ...(item.children ?? []).map((child) => child.href),
          ]),
        ),
      );
      const management = systemRole === "OWNER" || systemRole === "MANAGER";
      const candidates: CommandDefinition[] = [
        { id: "business-dashboard", labelKey: "business.dashboard", group: "navigation", href: "/business", icon: LayoutDashboard },
        { id: "business-bookings", labelKey: "business.bookings", group: "navigation", href: "/business/bookings", icon: CalendarDays },
        { id: "business-calendar", labelKey: "business.calendar", group: "navigation", href: "/business/calendar", icon: Clock3 },
        { id: "business-reservations", labelKey: "business.reservations", group: "navigation", href: "/business/reservations", icon: Armchair },
        { id: "business-tables", labelKey: "business.tables", group: "navigation", href: "/business/tables", icon: Armchair },
        { id: "business-menu", labelKey: "business.menu", group: "navigation", href: "/business/menu", icon: Menu },
        { id: "business-analytics", labelKey: "business.analytics", group: "navigation", href: "/business/analytics", icon: ChartNoAxesCombined },
        { id: "business-audit", labelKey: "business.audit", group: "navigation", href: "/business/manage/audit", icon: Settings },
        ...(membershipId
          ? [{ id: "business-availability", labelKey: "business.availability" as const, group: "navigation" as const, href: `/business/team/${membershipId}/availability`, icon: Clock3 }]
          : []),
        { id: "business-services", labelKey: "business.services", group: "navigation", href: "/business/services", icon: Sparkles },
        { id: "business-team", labelKey: "business.team", group: "navigation", href: "/business/team", icon: UsersRound },
        { id: "business-public-profile", labelKey: "business.publicProfile", group: "navigation", href: "/business/public-profile", icon: PanelsTopLeft },
        { id: "business-profile", labelKey: "business.profile", group: "navigation", href: "/business/manage", icon: Building2 },
        { id: "business-notifications", labelKey: "business.notifications", group: "navigation", href: "/business/notifications", icon: Bell },
        { id: "business-settings", labelKey: "business.settings", group: "navigation", href: "/business/manage/settings", icon: Settings },
        { id: "business-commerce", labelKey: "business.commerce", group: "navigation", href: "/business/commerce", icon: ShoppingBag },
        { id: "business-commerce-store", labelKey: "business.commerceStore", group: "navigation", href: "/business/commerce/store", icon: ShoppingBag },
        { id: "business-commerce-access", labelKey: "business.commerceAccess", group: "navigation", href: "/business/commerce/access", icon: Settings },
        { id: "business-commerce-products", labelKey: "business.commerceProducts", group: "navigation", href: "/business/commerce/products", icon: ShoppingBag },
        { id: "business-commerce-inventory", labelKey: "business.commerceInventory", group: "navigation", href: "/business/commerce/inventory", icon: ShoppingBag },
        ...(management
          ? [
              { id: "add-service", labelKey: "actions.addService" as const, group: "actions" as const, href: "/business/services", icon: Plus },
              { id: "add-employee", labelKey: "actions.addEmployee" as const, group: "actions" as const, href: "/business/team", icon: UserPlus },
            ]
          : []),
        ...(publicSlug
          ? [
              { id: "open-public", labelKey: "actions.openPublic" as const, group: "actions" as const, action: "open-public" as const, icon: ExternalLink },
              { id: "copy-public", labelKey: "actions.copyPublic" as const, group: "actions" as const, action: "copy-public" as const, icon: ClipboardCopy },
            ]
          : []),
      ];
      return candidates.filter(
        (command) => !command.href || allowedHrefs.has(command.href),
      );
    }
    return [
      { id: "customer-dashboard", labelKey: "customer.dashboard", group: "navigation", href: "/customer", icon: LayoutDashboard },
      { id: "marketplace", labelKey: "customer.marketplace", group: "navigation", href: "/marketplace", icon: Map },
      { id: "customer-bookings", labelKey: "customer.bookings", group: "navigation", href: "/customer/bookings", icon: CalendarDays },
      { id: "customer-favorites", labelKey: "customer.favorites", group: "navigation", href: "/customer/favorites", icon: Heart },
      { id: "customer-notifications", labelKey: "customer.notifications", group: "navigation", href: "/customer/notifications", icon: Bell },
      { id: "create-booking", labelKey: "actions.createBooking", group: "actions", href: "/customer/bookings/new", icon: CalendarPlus },
    ];
  }, [
    canAccessMessages,
    commercePermissions,
    membershipId,
    publicSlug,
    role,
    systemRole,
    vertical,
  ]);

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    function customOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", keyboard);
    window.addEventListener("rezno:open-command-palette", customOpen);
    return () => {
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("rezno:open-command-palette", customOpen);
    };
  }, [role]);

  const recent = recentIds.flatMap((id) => {
    const command = commands.find((item) => item.id === id);
    return command ? [command] : [];
  });

  function remember(command: CommandDefinition) {
    const next = [command.id, ...recentIds.filter((id) => id !== command.id)].slice(0, 5);
    setRecentIds(next);
    localStorage.setItem(`${RECENT_KEY}:${role}`, JSON.stringify(next));
  }

  async function run(command: CommandDefinition) {
    remember(command);
    setOpen(false);
    setQuery("");
    if (command.href) {
      router.push(command.href);
    } else if (command.action === "open-public" && publicSlug) {
      window.open(`/${publicSlug}`, "_blank", "noopener,noreferrer");
    } else if (command.action === "copy-public" && publicSlug) {
      await navigator.clipboard.writeText(`${window.location.origin}/${publicSlug}`);
    }
  }

  function renderItem(command: CommandDefinition) {
    const label = t(command.labelKey);
    return (
      <CommandItem
        key={command.id}
        value={`${label} ${command.keywords?.join(" ") ?? ""}`}
        onSelect={() => void run(command)}
        className="min-h-11 px-3"
      >
        <command.icon className="size-4 text-primary" />
        <span className="flex-1">
          <HighlightMatch text={label} query={query} />
        </span>
        <CommandShortcut className="ms-auto ml-0">↵</CommandShortcut>
      </CommandItem>
    );
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      title={t("title")}
      description={t("description")}
      className="max-w-xl border-primary/15 shadow-2xl"
    >
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: -8, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
      >
        <Command shouldFilter>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            className="h-10"
          />
          <CommandList className="max-h-[min(60vh,28rem)] p-1">
            <CommandEmpty>{t("empty")}</CommandEmpty>
            {!query && recent.length > 0 ? (
              <>
                <CommandGroup heading={t("groups.recent")}>
                  {recent.map(renderItem)}
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}
            {(["navigation", "actions"] as const).map((group, index) => (
              <Fragment key={group}>
                <CommandGroup heading={t(`groups.${group}`)}>
                  {commands.filter((command) => command.group === group).map(renderItem)}
                </CommandGroup>
                {index === 0 ? <CommandSeparator /> : null}
              </Fragment>
            ))}
          </CommandList>
          <div className="flex items-center justify-between border-t px-3 py-2 text-[0.7rem] text-muted-foreground">
            <span>{t("hintNavigate")}</span>
            <span>{t("hintClose")}</span>
          </div>
        </Command>
      </motion.div>
    </CommandDialog>
  );
}
