import "server-only";

import type { BookingStatus, BusinessVertical, SystemRole } from "@prisma/client";

import { requireCustomerIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";

const activePublicBusinessWhere = {
  deletedAt: null,
  isActive: true,
  status: "ACTIVE" as const,
  settings: {
    bookingEnabled: true,
    marketplaceVisible: true,
  },
};

export interface AccountHomeBookingPreview {
  id: string;
  serviceName: string;
  businessName: string;
  branchName: string;
  startsAt: Date;
  timezone: string;
  status: BookingStatus;
  isRestaurantReservation: boolean;
}

export interface AccountHomeBusiness {
  id: string;
  name: string;
  slug: string;
  vertical: BusinessVertical;
  roleName: string;
  systemRole: SystemRole | null;
  createdAt: Date;
}

export interface AccountHomeInvitation {
  id: string;
  businessName: string;
  systemRole: SystemRole | null;
  createdAt: Date;
}

export interface AccountHomeMessagePreview {
  id: string;
  title: string;
  preview: string;
  createdAt: Date;
  unread: boolean;
}

export interface AccountHomeData {
  userName: string;
  upcomingBookings: AccountHomeBookingPreview[];
  businesses: AccountHomeBusiness[];
  invitations: AccountHomeInvitation[];
  favoriteBusinessCount: number;
  favoriteServiceCount: number;
  unreadMessageCount: number;
  recentMessages: AccountHomeMessagePreview[];
}

function displayName({
  displayName,
  firstName,
  lastName,
  fallback,
}: {
  displayName: string | null;
  firstName: string;
  lastName: string | null;
  fallback: string;
}) {
  const preferredName = displayName?.trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const fallbackName = fallback.trim();

  return preferredName || fullName || fallbackName || "REZNO customer";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getCustomerAccountHomeData(): Promise<AccountHomeData> {
  const { person, session } = await requireCustomerIdentity();
  const now = new Date();
  const normalizedEmail = normalizeEmail(session.user.email);

  const [
    upcomingBookings,
    businesses,
    invitations,
    favoriteBusinessCount,
    favoriteServiceCount,
    unreadMessageCount,
    recentConversations,
  ] = await Promise.all([
    prisma.booking.findMany({
      where: {
        customerId: person.id,
        startsAt: { gte: now },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      include: {
        branch: { select: { name: true, timezone: true } },
        organization: { select: { name: true } },
        restaurantReservation: { select: { id: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 5,
    }),
    prisma.organizationMember.findMany({
      where: {
        personId: person.id,
        deletedAt: null,
        status: "ACTIVE",
        organization: {
          deletedAt: null,
          isActive: true,
          status: "ACTIVE",
        },
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            vertical: true,
          },
        },
        role: {
          select: {
            name: true,
            systemRole: true,
            organizationId: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
    prisma.organizationInvitation.findMany({
      where: {
        status: "PENDING",
        OR: [{ recipientPersonId: person.id }, { normalizedEmail }],
        organization: {
          deletedAt: null,
          status: "ACTIVE",
          isActive: true,
        },
      },
      include: {
        organization: { select: { name: true } },
        role: { select: { systemRole: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.customerFavoriteBusiness.count({
      where: {
        customerId: person.id,
        organization: activePublicBusinessWhere,
      },
    }),
    prisma.customerFavoriteService.count({
      where: {
        customerId: person.id,
        branchService: {
          isAvailable: true,
          service: { deletedAt: null, status: "ACTIVE" },
          branch: {
            deletedAt: null,
            status: "ACTIVE",
            organization: activePublicBusinessWhere,
          },
        },
      },
    }),
    prisma.message.count({
      where: {
        readAt: null,
        senderUserId: { not: session.user.id },
        conversation: {
          customerId: person.id,
          type: "CUSTOMER_BUSINESS",
        },
      },
    }),
    prisma.conversation.findMany({
      where: {
        customerId: person.id,
        type: "CUSTOMER_BUSINESS",
      },
      include: {
        business: { select: { name: true } },
        messages: {
          include: {
            sender: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 3,
    }),
  ]);

  return {
    userName: displayName({
      displayName: person.displayName,
      firstName: person.firstName,
      lastName: person.lastName,
      fallback: session.user.name,
    }),
    upcomingBookings: upcomingBookings.map((booking) => ({
      id: booking.id,
      serviceName: booking.serviceNameSnapshot,
      businessName: booking.organization.name,
      branchName: booking.branch.name,
      startsAt: booking.startsAt,
      timezone: booking.branch.timezone,
      status: booking.status,
      isRestaurantReservation: Boolean(booking.restaurantReservation),
    })),
    businesses: businesses
      .filter(
        (membership) =>
          membership.role.organizationId === membership.organization.id,
      )
      .map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        vertical: membership.organization.vertical,
        roleName: membership.role.name,
        systemRole: membership.role.systemRole,
        createdAt: membership.createdAt,
      })),
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      businessName: invitation.organization.name,
      systemRole: invitation.role?.systemRole ?? null,
      createdAt: invitation.createdAt,
    })),
    favoriteBusinessCount,
    favoriteServiceCount,
    unreadMessageCount,
    recentMessages: recentConversations.map((conversation) => {
      const lastMessage = conversation.messages[0];
      return {
        id: conversation.id,
        title: conversation.business?.name ?? conversation.subject ?? "",
        preview: lastMessage?.body ?? "",
        createdAt: lastMessage?.createdAt ?? conversation.updatedAt,
        unread: Boolean(
          lastMessage &&
            lastMessage.senderUserId !== session.user.id &&
            lastMessage.readAt === null,
        ),
      };
    }),
  };
}
