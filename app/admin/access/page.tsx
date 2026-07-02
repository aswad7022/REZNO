import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import {
  grantAdminAccess,
  updateAdminAccess,
  updateAdminAccessStatus,
} from "@/features/admin/actions/manage-admin-access";
import {
  adminPermissions,
  defaultAdminPermissions,
} from "@/features/admin/config/permissions";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { getAdminAccessManagementData } from "@/features/admin/services/admin-access-management";
import { getAdminEmails } from "@/features/admin/services/admin-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    userId?: string;
    adminAction?: string;
    mode?: string;
  }>;
}) {
  const params = await searchParams;
  const [data, rootEmails, t, format] = await Promise.all([
    getAdminAccessManagementData({ q: params.q, userId: params.userId }),
    Promise.resolve(Array.from(getAdminEmails())),
    getTranslations("Admin"),
    getFormatter(),
  ]);
  const selectedUserId = params.userId ?? data.selectedUser?.id ?? "";
  const selectedPermissions =
    data.selectedUser?.adminAccess?.permissions ?? defaultAdminPermissions;
  const showGrantPanel = Boolean(data.selectedUser);

  return (
    <>
      <AdminPageHeader
        title={t("adminAccess")}
        description={t("adminAccessDescription")}
      />
      {params.adminAction ? (
        <div
          className={
            params.adminAction === "success"
              ? "mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              : "mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          }
        >
          {params.adminAction === "success"
            ? t("adminAccessUpdated")
            : t("actionFailed")}
        </div>
      ) : null}

      <Card className="mb-5 border-primary/10">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Root Super Admin</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("rootSuperAdminHelp")}
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/access?mode=add#grant-admin">
              {t("addNewAdmin")}
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {rootEmails.length === 0 ? (
              <Badge variant="destructive">{t("notConfigured")}</Badge>
            ) : (
              rootEmails.map((email) => (
                <Badge key={email} variant="secondary">
                  {email}
                </Badge>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className="border-primary/10">
          <CardHeader>
            <CardTitle>{t("currentAdmins")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.adminAccesses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noAdminAccess")}
              </p>
            ) : (
              data.adminAccesses.map((access) => (
                <article key={access.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {access.user.name || access.user.email}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {access.user.email}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge>{access.role}</Badge>
                        <Badge
                          variant={
                            access.status === "ACTIVE"
                              ? "default"
                              : "secondary"
                          }
                        >
                        {access.status}
                      </Badge>
                      <Badge variant="outline">
                        {format.dateTime(access.createdAt, {
                          dateStyle: "medium",
                        })}
                      </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("grantedBy")}: {access.grantedBy?.email ?? "—"}
                    </p>
                  </div>
                  <form
                    action={updateAdminAccess.bind(null, access.id)}
                    className="mt-4 grid gap-2 sm:grid-cols-2"
                  >
                    <PermissionChecklist selected={access.permissions} t={t} />
                    <div className="sm:col-span-2">
                      <Button type="submit" size="sm">
                        {t("adminAccessUpdated")}
                      </Button>
                    </div>
                  </form>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {access.status !== "ACTIVE" ? (
                      <StatusForm
                        accessId={access.id}
                        status="ACTIVE"
                        label={t("reactivateAdminAccess")}
                      />
                    ) : (
                      <StatusForm
                        accessId={access.id}
                        status="SUSPENDED"
                        label={t("suspendAdminAccess")}
                        destructive
                      />
                    )}
                    <StatusForm
                      accessId={access.id}
                      status="REVOKED"
                      label={t("revokeAdminAccess")}
                      destructive
                    />
                  </div>
                </article>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card id="grant-admin" className="border-primary/10">
            <CardHeader>
              <CardTitle>{t("addNewAdmin")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  name="q"
                  defaultValue={params.q}
                  type="email"
                  placeholder={t("enterUserEmail")}
                  aria-label={t("enterUserEmail")}
                />
                <input type="hidden" name="mode" value="add" />
                <Button type="submit">{t("searchUser")}</Button>
              </form>

              {params.q && data.candidates.length === 0 ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {t("noUserFoundWithEmail")}
                </p>
              ) : null}

              {data.candidates.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t("selectUser")}</p>
                  {data.candidates.map((candidate) => (
                    <Link
                      key={candidate.user.id}
                      href={`/admin/access?mode=add&q=${encodeURIComponent(
                        params.q ?? "",
                      )}&userId=${candidate.user.id}#grant-admin`}
                      className="block rounded-xl border p-3 text-sm transition hover:bg-muted/60"
                    >
                      <span className="font-medium">{candidate.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {candidate.user.email} ·{" "}
                        {candidate.person?.status ?? "User"}
                      </span>
                      {candidate.user.adminAccess ? (
                        <Badge className="mt-2" variant="secondary">
                          {t("userAlreadyHasAdminAccess")}
                        </Badge>
                      ) : null}
                    </Link>
                  ))}
                </div>
              ) : null}

              {showGrantPanel ? (
                <form action={grantAdminAccess} className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">
                      {t("selectUser")}
                    </span>
                    <Input
                      name="userId"
                      defaultValue={selectedUserId}
                      placeholder="User ID"
                      required
                      readOnly={Boolean(data.selectedUser)}
                    />
                  </label>
                {data.selectedUser ? (
                  <div className="rounded-xl bg-muted px-3 py-2 text-sm">
                    <p className="font-medium">{data.selectedUser.name}</p>
                    <p className="text-muted-foreground">
                      {data.selectedUser.email}
                    </p>
                    {data.selectedUser.adminAccess ? (
                      <Badge className="mt-2" variant="secondary">
                        {t("manageAdminAccess")}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      {t("choosePermissions")}
                    </p>
                    <div className="grid gap-2">
                      <PermissionChecklist selected={selectedPermissions} t={t} />
                    </div>
                  </div>
                  <Button type="submit" className="w-full">
                    {t("grantAdminAccess")}
                  </Button>
                </form>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function PermissionChecklist({
  selected,
  t,
}: {
  selected: Iterable<string>;
  t: Awaited<ReturnType<typeof getTranslations<"Admin">>>;
}) {
  const selectedSet = new Set(selected);
  const permissionLabels = adminPermissions;

  return (
    <>
      {permissionLabels.map((permission) => (
        <label
          key={permission}
          className="flex items-start gap-2 rounded-xl border p-3 text-sm"
        >
          <input
            type="checkbox"
            name="permissions"
            value={permission}
            defaultChecked={selectedSet.has(permission)}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">
              {t(`permissionsLabels.${permission}`)}
            </span>
            <span className="block text-xs text-muted-foreground">
              {permission}
            </span>
          </span>
        </label>
      ))}
    </>
  );
}

function StatusForm({
  accessId,
  status,
  label,
  destructive,
}: {
  accessId: string;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  label: string;
  destructive?: boolean;
}) {
  return (
    <form action={updateAdminAccessStatus.bind(null, accessId)}>
      <input type="hidden" name="status" value={status} />
      <Button
        type="submit"
        size="sm"
        variant={destructive ? "destructive" : "outline"}
      >
        {label}
      </Button>
    </form>
  );
}
