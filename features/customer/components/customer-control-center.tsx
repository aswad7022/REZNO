import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  Heart,
  MessageSquareText,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

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
import { selectActiveBusiness } from "@/features/business-context/actions/select-active-business";
import { getCustomerAccountHomeData } from "@/features/customer/services/account-home";

function firstName(name: string) {
  return name.split(/\s+/).filter(Boolean)[0] ?? name;
}

export async function CustomerControlCenter() {
  const [data, t, bookingsT, format] = await Promise.all([
    getCustomerAccountHomeData(),
    getTranslations("CustomerHome"),
    getTranslations("Bookings"),
    getFormatter(),
  ]);

  const hasBusinesses = data.businesses.length > 0;
  const hasInvitations = data.invitations.length > 0;
  const hasFavorites =
    data.favoriteBusinessCount > 0 || data.favoriteServiceCount > 0;
  const hasMessages =
    data.unreadMessageCount > 0 || data.recentMessages.length > 0;

  const quickActions = [
    {
      key: "bookService",
      href: "/marketplace",
      icon: Search,
      title: t("actions.bookService"),
      description: t("actions.bookServiceDescription"),
      show: true,
    },
    {
      key: "addBusiness",
      href: "/onboarding/business",
      icon: Plus,
      title: t("actions.addBusiness"),
      description: t("actions.addBusinessDescription"),
      show: true,
    },
    {
      key: "manageBusiness",
      href: "/business",
      icon: Building2,
      title: t("actions.manageBusiness"),
      description: t("actions.manageBusinessDescription"),
      show: hasBusinesses,
    },
    {
      key: "workInvitations",
      href: "/customer/work-invitations",
      icon: BriefcaseBusiness,
      title: t("actions.workInvitations"),
      description: t("actions.workInvitationsDescription"),
      show: true,
    },
    {
      key: "favorites",
      href: "/customer/favorites",
      icon: Heart,
      title: t("actions.favorites"),
      description: t("actions.favoritesDescription"),
      show: true,
    },
    {
      key: "messages",
      href: "/customer/messages",
      icon: MessageSquareText,
      title: t("actions.messages"),
      description: t("actions.messagesDescription"),
      show: true,
    },
    {
      key: "profile",
      href: "/customer/profile",
      icon: Settings,
      title: t("actions.profile"),
      description: t("actions.profileDescription"),
      show: true,
    },
  ].filter((action) => action.show);

  return (
    <DashboardShell className="space-y-8">
      <DashboardPageHeader
        title={t("welcome", { name: firstName(data.userName) })}
        description={t("description")}
        actions={
          <Button asChild>
            <Link href="/marketplace">
              <Sparkles />
              {t("actions.bookService")}
            </Link>
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CalendarCheck2}
          label={t("metrics.upcomingBookings")}
          value={data.upcomingBookings.length}
        />
        <MetricCard
          icon={Building2}
          label={t("metrics.businesses")}
          value={data.businesses.length}
        />
        <MetricCard
          icon={BriefcaseBusiness}
          label={t("metrics.workInvitations")}
          value={data.invitations.length}
        />
        <MetricCard
          icon={Bell}
          label={t("metrics.unreadMessages")}
          value={data.unreadMessageCount}
        />
      </section>

      <section>
        <SectionHeader
          title={t("quickActions")}
          description={t("quickActionsDescription")}
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((action) => (
            <Link key={action.key} href={action.href} className="group">
              <Card className="h-full border-primary/10 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                <CardContent className="flex gap-4 p-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <action.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold group-hover:text-primary">
                      {action.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
        <Card className="border-primary/10">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{t("upcomingBookings")}</CardTitle>
              <CardDescription>{t("upcomingBookingsDescription")}</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/customer/bookings">
                {t("viewAll")}
                <ArrowLeft className="rtl:rotate-0 ltr:rotate-180" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.upcomingBookings.length === 0 ? (
              <DashboardEmpty
                icon={CalendarCheck2}
                title={t("empty.noUpcomingBookings")}
                description={t("empty.noUpcomingBookingsDescription")}
                action={
                  <Button asChild variant="outline">
                    <Link href="/marketplace">{t("actions.bookService")}</Link>
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3">
                {data.upcomingBookings.map((booking) => (
                  <Link
                    key={booking.id}
                    href={`/customer/bookings/${booking.id}`}
                    className="rounded-2xl border bg-card/70 p-4 transition hover:border-primary/30"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{booking.serviceName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {booking.businessName} · {booking.branchName}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {booking.isRestaurantReservation ? (
                          <Badge variant="secondary">
                            {t("tableReservation")}
                          </Badge>
                        ) : null}
                        <Badge>{bookingsT(`statuses.${booking.status}`)}</Badge>
                      </div>
                    </div>
                    <p className="mt-3 text-sm">
                      {format.dateTime(booking.startsAt, {
                        timeZone: booking.timezone,
                        dateStyle: "medium",
                        timeStyle: "short",
                        hour12: true,
                      })}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/10">
          <CardHeader>
            <CardTitle>{t("messages")}</CardTitle>
            <CardDescription>
              {hasMessages
                ? t("messagesDescription", {
                    count: data.unreadMessageCount,
                  })
                : t("empty.noMessages")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentMessages.length === 0 ? (
              <DashboardEmpty
                icon={MessageSquareText}
                title={t("empty.noMessages")}
                description={t("empty.noMessagesDescription")}
                action={
                  <Button asChild variant="outline">
                    <Link href="/customer/messages">{t("viewMessages")}</Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {data.recentMessages.map((message) => (
                  <Link
                    key={message.id}
                    href={`/customer/messages?conversationId=${message.id}`}
                    className="block rounded-2xl border bg-card/70 p-4 transition hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold">{message.title}</p>
                      {message.unread ? (
                        <Badge variant="secondary">{t("unread")}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {message.preview}
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {format.dateTime(message.createdAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </Link>
                ))}
                <Button asChild variant="ghost" className="w-full">
                  <Link href="/customer/messages">{t("viewMessages")}</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <Card className="border-primary/10 xl:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{t("myBusinesses")}</CardTitle>
              <CardDescription>{t("myBusinessesDescription")}</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/onboarding/business">
                <Plus />
                {t("addBusiness")}
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.businesses.length === 0 ? (
              <DashboardEmpty
                icon={Building2}
                title={t("empty.noBusinesses")}
                description={t("empty.noBusinessesDescription")}
                action={
                  <Button asChild>
                    <Link href="/onboarding/business">{t("addBusiness")}</Link>
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {data.businesses.map((business) => (
                  <Card key={business.id} className="bg-card/70 shadow-none">
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{business.name}</CardTitle>
                        <Badge variant="secondary">
                          {business.systemRole
                            ? t(`roles.${business.systemRole}`)
                            : business.roleName}
                        </Badge>
                      </div>
                      <CardDescription>{business.slug}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form action={selectActiveBusiness}>
                        <input
                          type="hidden"
                          name="businessId"
                          value={business.id}
                        />
                        <input type="hidden" name="next" value="/business" />
                        <Button
                          type="submit"
                          className="w-full"
                          variant="outline"
                        >
                          {t("switchAndOpenDashboard")}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle>{t("workInvitations")}</CardTitle>
              <CardDescription>
                {hasInvitations
                  ? t("workInvitationsDescription", {
                      count: data.invitations.length,
                    })
                  : t("empty.noWorkInvitations")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.invitations.length === 0 ? (
                <EmptyCompact
                  icon={BriefcaseBusiness}
                  title={t("empty.noWorkInvitations")}
                  description={t("empty.noWorkInvitationsDescription")}
                />
              ) : (
                <div className="space-y-3">
                  {data.invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="rounded-2xl border bg-card/70 p-4"
                    >
                      <p className="font-semibold">{invitation.businessName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {invitation.systemRole
                          ? t(`roles.${invitation.systemRole}`)
                          : t("roles.CUSTOM")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <Button asChild variant="ghost" className="mt-4 w-full">
                <Link href="/customer/work-invitations">
                  {t("viewInvitations")}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle>{t("favorites")}</CardTitle>
              <CardDescription>
                {hasFavorites
                  ? t("favoritesDescription", {
                      places: data.favoriteBusinessCount,
                      services: data.favoriteServiceCount,
                    })
                  : t("empty.noFavorites")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyCompact
                icon={Heart}
                title={
                  hasFavorites ? t("savedFavorites") : t("empty.noFavorites")
                }
                description={
                  hasFavorites
                    ? t("savedFavoritesDescription", {
                        places: data.favoriteBusinessCount,
                        services: data.favoriteServiceCount,
                      })
                    : t("empty.noFavoritesDescription")
                }
              />
              <Button asChild variant="ghost" className="mt-4 w-full">
                <Link href="/customer/favorites">{t("viewFavorites")}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </DashboardShell>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarCheck2;
  label: string;
  value: number;
}) {
  return (
    <Card className="border-primary/10">
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}

function EmptyCompact({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CalendarCheck2;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-center">
      <span className="mx-auto grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
