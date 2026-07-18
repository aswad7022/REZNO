"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  sendConversationMessage,
  startAdminConversation,
  startCustomerBusinessConversation,
} from "@/features/messages/actions/messages";
import { initialMessageActionState } from "@/features/messages/types";
import type { DashboardRole } from "@/types/dashboard";

type Target = { id: string; kind: "BUSINESS" | "USER"; label: string };

export function CustomerStartConversationForm({
  businesses,
}: {
  businesses: Target[];
}) {
  const t = useTranslations("Messaging");
  const [state, formAction, pending] = useActionState(
    startCustomerBusinessConversation,
    initialMessageActionState,
  );
  const idempotencyKey = useIdempotencyKey(state.status);
  const formRef = useResetForm(state.status);
  return (
    <form action={formAction} className="space-y-3" ref={formRef}>
      <FieldSelect
        name="businessId"
        label={t("business")}
        items={businesses}
      />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <MessageTextarea id="customer-start-message" />
      <Submit pending={pending} label={t("send")} />
      <StateMessage state={state} />
    </form>
  );
}

export function AdminStartConversationForm({ targets }: { targets: Target[] }) {
  const t = useTranslations("Messaging");
  const [state, formAction, pending] = useActionState(
    startAdminConversation,
    initialMessageActionState,
  );
  const idempotencyKey = useIdempotencyKey(state.status);
  const formRef = useResetForm(state.status);
  return (
    <form action={formAction} className="space-y-3" ref={formRef}>
      <div className="space-y-2">
        <Label htmlFor="admin-message-target">{t("target")}</Label>
        <select
          id="admin-message-target"
          name="target"
          className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
          required
          defaultValue=""
        >
          <option value="">{t("noTargets")}</option>
          {targets.map((target) => (
            <option key={`${target.kind}:${target.id}`} value={`${target.kind}:${target.id}`}>
              {target.label}
            </option>
          ))}
        </select>
      </div>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <MessageTextarea id="admin-start-message" />
      <Submit pending={pending} label={t("send")} />
      <StateMessage state={state} />
    </form>
  );
}

export function ReplyForm({
  conversationId,
  role,
}: {
  conversationId: string;
  role: DashboardRole | "admin";
}) {
  const t = useTranslations("Messaging");
  const action = sendConversationMessage.bind(null, role, conversationId);
  const [state, formAction, pending] = useActionState(
    action,
    initialMessageActionState,
  );
  const idempotencyKey = useIdempotencyKey(state.status);
  const formRef = useResetForm(state.status);
  return (
    <form action={formAction} className="mt-4 space-y-2" ref={formRef}>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <MessageTextarea id={`reply-${conversationId}`} />
      <div className="flex flex-wrap items-center gap-3">
        <Submit pending={pending} label={t("reply")} />
        <StateMessage state={state} />
      </div>
    </form>
  );
}

function FieldSelect({
  name,
  label,
  items,
}: {
  name: string;
  label: string;
  items: Target[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        required
        className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
      >
        <option value="">—</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function MessageTextarea({ id }: { id: string }) {
  const t = useTranslations("Messaging");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("message")}</Label>
      <textarea
        id={id}
        name="body"
        required
        maxLength={1000}
        placeholder={t("messagePlaceholder")}
        className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}

function Submit({ pending, label }: { pending: boolean; label: string }) {
  const t = useTranslations("Messaging");
  return (
    <Button type="submit" disabled={pending}>
      <Send aria-hidden="true" />
      {pending ? t("sending") : label}
    </Button>
  );
}

function StateMessage({
  state,
}: {
  state: { status: "idle" | "success" | "error"; message?: string };
}) {
  return state.message ? (
    <p
      aria-live="polite"
      className={
        state.status === "error"
          ? "text-sm text-destructive"
          : "text-sm text-muted-foreground"
      }
    >
      {state.message}
    </p>
  ) : null;
}

function useIdempotencyKey(status: "error" | "idle" | "success") {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const previous = useRef(status);
  useEffect(() => {
    if (status === "success" && previous.current !== "success") {
      setKey(crypto.randomUUID());
    }
    previous.current = status;
  }, [status]);
  return key;
}

function useResetForm(status: "error" | "idle" | "success") {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (status === "success") formRef.current?.reset();
  }, [status]);
  return formRef;
}
