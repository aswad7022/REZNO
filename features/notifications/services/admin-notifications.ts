import "server-only";

import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { prisma } from "@/lib/db/prisma";

export async function getAdminNotificationsPageData() {
  await requireAdminPermission("NOTIFICATIONS_SEND");
  const [notifications, businesses, users] = await Promise.all([
    prisma.notification.findMany({
      include: {
        business: { select: { name: true } },
        recipientPerson: { select: { firstName: true, displayName: true } },
        createdBy: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.organization.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.person.findMany({
      where: { deletedAt: null },
      select: { id: true, firstName: true, displayName: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return {
    notifications,
    businesses,
    users: users.map((user) => ({
      id: user.id,
      name: user.displayName ?? user.firstName,
    })),
  };
}
