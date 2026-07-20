import "server-only";

import { requireBusinessIdentity } from "@/features/identity/server";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { prisma } from "@/lib/db/prisma";
import { resolvePublicMediaBatch } from "@/features/media/services/media-query";

export async function getPublicProfileManagementData() {
  await currentBusinessOperationReference("SETTINGS_READ");
  const { membership } = await requireBusinessIdentity();
  const organizationId = membership.organizationId;
  const [branches, services] = await Promise.all([
    prisma.branch.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        businessHours: { orderBy: { dayOfWeek: "asc" } },
        blockedTimes: {
          where: { memberId: null, endsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
          take: 12,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.service.findMany({
      where: { organizationId },
      select: { id: true, name: true, imageUrl: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const media = await resolvePublicMediaBatch(services.map((service) => ({
    id: service.id,
    kind: "SERVICE" as const,
    legacyValues: [service.imageUrl],
    slot: "SERVICE_PRIMARY" as const,
  })));

  return {
    branches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      address: [branch.addressLine1, branch.addressLine2]
        .filter(Boolean)
        .join(" "),
      city: branch.city ?? "",
      latitude: branch.latitude?.toString() ?? "",
      longitude: branch.longitude?.toString() ?? "",
      days: branch.businessHours,
      specialClosures: branch.blockedTimes,
    })),
    services: services.map((service) => ({
      ...service,
      imageUrl: media.get(`SERVICE:${service.id}:SERVICE_PRIMARY`)?.[0]?.stableDeliveryPath ?? "",
    })),
  };
}
