import "server-only";

import { requireSuperAdmin } from "@/features/admin/services/admin-auth";
import { prisma } from "@/lib/db/prisma";

type CandidatePerson = {
  id: string;
  authUserId: string;
  firstName: string;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  status: string;
} | null;

type CandidateUser = {
  id: string;
  email: string;
  name: string;
  adminAccess: {
    id: string;
    status: string;
    role: string;
    permissions: string[];
  } | null;
};

type AdminAccessCandidate = {
  person: CandidatePerson;
  user: CandidateUser;
  name: string;
};

export async function getAdminAccessManagementData(options?: {
  userId?: string;
  q?: string;
}) {
  await requireSuperAdmin();

  const query = options?.q?.trim();
  const [adminAccesses, selectedUser, candidatePeople, emailMatches] =
    await Promise.all([
    prisma.adminAccess.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
        grantedBy: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    options?.userId
      ? prisma.user.findUnique({
          where: { id: options.userId },
          select: {
            id: true,
            email: true,
            name: true,
            adminAccess: {
              select: {
                id: true,
                status: true,
                role: true,
                permissions: true,
              },
            },
          },
        })
      : null,
      query
        ? prisma.person.findMany({
            where: {
              deletedAt: null,
              OR: [
                { firstName: { contains: query, mode: "insensitive" } },
                { lastName: { contains: query, mode: "insensitive" } },
                { displayName: { contains: query, mode: "insensitive" } },
                { phone: { contains: query, mode: "insensitive" } },
              ],
            },
            select: {
              id: true,
              authUserId: true,
              firstName: true,
              lastName: true,
              displayName: true,
              phone: true,
              status: true,
            },
            orderBy: { createdAt: "desc" },
            take: 30,
          })
        : Promise.resolve([]),
      query
        ? prisma.user.findMany({
            where: {
              OR: [
                { email: { contains: query, mode: "insensitive" } },
                { name: { contains: query, mode: "insensitive" } },
              ],
            },
            select: {
              id: true,
              email: true,
              name: true,
              adminAccess: {
                select: {
                  id: true,
                  status: true,
                  role: true,
                  permissions: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 30,
          })
        : Promise.resolve([]),
    ]);

  const candidateUsers = await prisma.user.findMany({
    where: {
      id: {
        in: Array.from(
          new Set([
            ...candidatePeople.map((person) => person.authUserId),
            ...emailMatches.map((user) => user.id),
          ]),
        ),
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      adminAccess: {
        select: {
          id: true,
          status: true,
          role: true,
          permissions: true,
        },
      },
    },
  });
  const candidateUserMap = new Map(
    candidateUsers.map((user) => [user.id, user]),
  );
  const candidates: AdminAccessCandidate[] = [];

  for (const person of candidatePeople) {
    const user = candidateUserMap.get(person.authUserId);
    if (!user) continue;
    candidates.push({
      person,
      user,
      name:
        person.displayName ??
        [person.firstName, person.lastName].filter(Boolean).join(" "),
    });
  }

  for (const user of emailMatches) {
    if (candidatePeople.some((person) => person.authUserId === user.id)) {
      continue;
    }

    candidates.push({
      person: null,
      user,
      name: user.name || user.email,
    });
  }

  return {
    adminAccesses,
    selectedUser,
    candidates,
  };
}
