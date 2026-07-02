import { AdminShell } from "@/features/admin/components/admin-shell";
import { AdminAccessNotConfigured } from "@/features/admin/components/admin-access-not-configured";
import { getAdminAccessState } from "@/features/admin/services/admin-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getAdminAccessState();

  if (access.status === "notConfigured") {
    return <AdminAccessNotConfigured />;
  }

  return <AdminShell>{children}</AdminShell>;
}
