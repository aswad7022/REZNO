import "server-only";

import { forbidden } from "next/navigation";

import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { canAccessOrganizationConversations } from "@/features/identity/policies/authorization";
import {
  requireBusinessIdentity,
  requireCustomerIdentity,
} from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import { adminConversationWhere } from "@/features/messages/policies/conversation-access";
import type { DashboardRole } from "@/types/dashboard";

export interface DashboardMessagePreview {
  id: string;
  href: string;
  title: string;
  preview: string;
  createdAt: Date;
  unread: boolean;
}

const conversationInclude = {
  business: { select: { id: true, name: true, slug: true } },
  customer: { select: { id: true, firstName: true, displayName: true } },
  adminUser: { select: { id: true, email: true, name: true } },
  booking: {
    select: {
      id: true,
      serviceNameSnapshot: true,
      startsAt: true,
      status: true,
      restaurantReservation: { select: { id: true, guestCount: true } },
    },
  },
  messages: {
    include: { sender: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "desc" as const },
    take: 10,
  },
};

const previewInclude = {
  business: { select: { name: true } },
  customer: { select: { firstName: true, displayName: true } },
  messages: {
    include: { sender: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
};

function requireBusinessMessagingRole(systemRole: import("@prisma/client").SystemRole | null) {
  if (!canAccessOrganizationConversations(systemRole)) forbidden();
}

function toPreview({
  conversation,
  currentUserId,
  hrefBase,
  fallbackTitle,
}: {
  conversation: {
    id: string;
    business?: { name: string } | null;
    customer?: { firstName: string; displayName: string | null } | null;
    subject?: string | null;
    updatedAt: Date;
    messages: Array<{
      body: string;
      createdAt: Date;
      readAt: Date | null;
      senderUserId: string;
      sender: { name: string; email: string };
    }>;
  };
  currentUserId: string;
  hrefBase: string;
  fallbackTitle: string;
}): DashboardMessagePreview {
  const lastMessage = conversation.messages[0];
  const title =
    conversation.subject ??
    conversation.business?.name ??
    conversation.customer?.displayName ??
    conversation.customer?.firstName ??
    fallbackTitle;

  return {
    id: conversation.id,
    href: `${hrefBase}?conversationId=${conversation.id}`,
    title,
    preview: lastMessage?.body ?? "",
    createdAt: lastMessage?.createdAt ?? conversation.updatedAt,
    unread: Boolean(
      lastMessage &&
        lastMessage.senderUserId !== currentUserId &&
        lastMessage.readAt === null,
    ),
  };
}

export async function getDashboardMessagePreviews(
  role: DashboardRole | "admin",
  limit = 5,
): Promise<DashboardMessagePreview[]> {
  if (role === "customer") {
    const { person, session } = await requireCustomerIdentity();
    const conversations = await prisma.conversation.findMany({
      where: {
        customerId: person.id,
        type: { in: ["CUSTOMER_BUSINESS", "ADMIN_USER"] },
      },
      include: previewInclude,
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return conversations.map((conversation) =>
      toPreview({
        conversation,
        currentUserId: session.user.id,
        hrefBase: "/customer/messages",
        fallbackTitle: "محادثة",
      }),
    );
  }

  if (role === "business") {
    const { membership, session } = await requireBusinessIdentity();
    requireBusinessMessagingRole(membership.role.systemRole);
    const conversations = await prisma.conversation.findMany({
      where: {
        businessId: membership.organizationId,
        type: { in: ["CUSTOMER_BUSINESS", "ADMIN_BUSINESS"] },
      },
      include: previewInclude,
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return conversations.map((conversation) =>
      toPreview({
        conversation,
        currentUserId: session.user.id,
        hrefBase: "/business/messages",
        fallbackTitle: "محادثة",
      }),
    );
  }

  const { identity } = await requireAdminPermission("MESSAGES_VIEW");
  const conversations = await prisma.conversation.findMany({
    where: adminConversationWhere(identity.session.user.id),
    include: previewInclude,
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return conversations.map((conversation) =>
    toPreview({
      conversation,
      currentUserId: identity.session.user.id,
      hrefBase: "/admin/messages",
      fallbackTitle: "Admin conversation",
    }),
  );
}

export async function getMessagesPageData(role: DashboardRole | "admin") {
  if (role === "customer") {
    const { person } = await requireCustomerIdentity();
    const [conversations, businesses] = await Promise.all([
      prisma.conversation.findMany({
        where: {
          customerId: person.id,
          type: { in: ["CUSTOMER_BUSINESS", "ADMIN_USER"] },
        },
        include: conversationInclude,
        orderBy: { updatedAt: "desc" },
        take: 30,
      }),
      prisma.organization.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          status: "ACTIVE",
          bookings: { some: { customerId: person.id } },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 30,
      }),
    ]);
    return { conversations, businesses, users: [] };
  }

  if (role === "business") {
    const { membership } = await requireBusinessIdentity();
    requireBusinessMessagingRole(membership.role.systemRole);
    const conversations = await prisma.conversation.findMany({
      where: {
        businessId: membership.organizationId,
        type: { in: ["CUSTOMER_BUSINESS", "ADMIN_BUSINESS"] },
      },
      include: conversationInclude,
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
    return { conversations, businesses: [], users: [] };
  }

  const { identity } = await requireAdminPermission("MESSAGES_VIEW");
  const [conversations, businesses, users] = await Promise.all([
    prisma.conversation.findMany({
      where: adminConversationWhere(identity.session.user.id),
      include: conversationInclude,
      orderBy: { updatedAt: "desc" },
      take: 100,
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
    conversations,
    businesses,
    users: users.map((user) => ({
      id: user.id,
      name: user.displayName ?? user.firstName,
    })),
  };
}

export async function getUnreadMessageCount(role: DashboardRole | "admin") {
  if (role === "customer") {
    const { person, session } = await requireCustomerIdentity();
    return prisma.message.count({
      where: {
        readAt: null,
        senderUserId: { not: session.user.id },
        conversation: {
          customerId: person.id,
          type: { in: ["CUSTOMER_BUSINESS", "ADMIN_USER"] },
        },
      },
    });
  }

  if (role === "business") {
    const { membership, session } = await requireBusinessIdentity();
    requireBusinessMessagingRole(membership.role.systemRole);
    return prisma.message.count({
      where: {
        readAt: null,
        senderUserId: { not: session.user.id },
        conversation: {
          businessId: membership.organizationId,
          type: { in: ["CUSTOMER_BUSINESS", "ADMIN_BUSINESS"] },
        },
      },
    });
  }

  const { identity } = await requireAdminPermission("MESSAGES_VIEW");
  const { session } = identity;
  return prisma.message.count({
    where: {
      readAt: null,
      senderUserId: { not: session.user.id },
      conversation: adminConversationWhere(session.user.id),
    },
  });
}
