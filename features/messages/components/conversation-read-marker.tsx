"use client";

import { useEffect, useRef, useTransition } from "react";

import { markConversationRead } from "@/features/messages/actions/messages";
import type { DashboardRole } from "@/types/dashboard";

export function ConversationReadMarker({
  conversationId,
  role,
  throughMessageId,
}: {
  conversationId: string;
  role: DashboardRole | "admin";
  throughMessageId?: string;
}) {
  const [, startTransition] = useTransition();
  const lastRequest = useRef("");
  useEffect(() => {
    const request = `${role}:${conversationId}:${throughMessageId ?? "latest"}`;
    if (lastRequest.current === request) return;
    lastRequest.current = request;
    startTransition(async () => {
      await markConversationRead(role, conversationId, throughMessageId);
    });
  }, [conversationId, role, throughMessageId]);
  return null;
}
