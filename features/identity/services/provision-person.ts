import "server-only";

import { prisma } from "@/lib/db/prisma";

export interface ProvisionPersonInput {
  authUserId: string;
  name: string;
  image?: string | null;
}

function parseName(name: string): {
  displayName: string;
  firstName: string;
  lastName: string | null;
} {
  const normalizedName = name.trim();
  const parts = normalizedName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "REZNO";
  const lastName = parts.slice(1).join(" ") || null;

  return {
    displayName: normalizedName || firstName,
    firstName,
    lastName,
  };
}

export function provisionPerson({
  authUserId,
  image,
  name,
}: ProvisionPersonInput) {
  const parsedName = parseName(name);

  return prisma.person.upsert({
    where: { authUserId },
    create: {
      authUserId,
      firstName: parsedName.firstName,
      lastName: parsedName.lastName,
      displayName: parsedName.displayName,
      avatarUrl: image ?? null,
    },
    update: {},
  });
}
