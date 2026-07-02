"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  sendConversationMessage,
  startAdminConversation,
  startCustomerBusinessConversation,
} from "@/features/messages/actions/messages";
import { initialMessageActionState } from "@/features/messages/types";
import type { DashboardRole } from "@/types/dashboard";

export function CustomerStartConversationForm({
  businesses,
}: {
  businesses: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    startCustomerBusinessConversation,
    initialMessageActionState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <FieldSelect name="businessId" label="النشاط" items={businesses} />
      <MessageTextarea />
      <Submit pending={pending} label="إرسال للنشاط" />
      <StateMessage state={state} />
    </form>
  );
}

export function AdminStartConversationForm({
  businesses,
  users,
}: {
  businesses: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    startAdminConversation,
    initialMessageActionState,
  );

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="targetType">الوجهة</Label>
        <select
          id="targetType"
          name="targetType"
          defaultValue="USER"
          className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
        >
          <option value="USER">مستخدم</option>
          <option value="BUSINESS">نشاط</option>
        </select>
      </div>
      <FieldSelect name="personId" label="مستخدم" items={users} optional />
      <FieldSelect name="businessId" label="نشاط" items={businesses} optional />
      <div className="md:col-span-2">
        <MessageTextarea />
      </div>
      <div className="md:col-span-2">
        <Submit pending={pending} label="إرسال" />
        <StateMessage state={state} />
      </div>
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
  const action = sendConversationMessage.bind(null, role, conversationId);
  const [state, formAction, pending] = useActionState(
    action,
    initialMessageActionState,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <MessageTextarea compact />
      <div className="flex items-center gap-3">
        <Submit pending={pending} label="رد" />
        <StateMessage state={state} />
      </div>
    </form>
  );
}

function FieldSelect({
  name,
  label,
  items,
  optional,
}: {
  name: string;
  label: string;
  items: Array<{ id: string; name: string }>;
  optional?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        required={!optional}
        className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
      >
        <option value="">اختر</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function MessageTextarea({ compact }: { compact?: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={compact ? undefined : "message-body"}>الرسالة</Label>
      <textarea
        id={compact ? undefined : "message-body"}
        name="body"
        required
        maxLength={1000}
        placeholder="اكتب رسالتك"
        className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}

function Submit({ pending, label }: { pending: boolean; label: string }) {
  return (
    <Button type="submit" disabled={pending}>
      <Send />
      {pending ? "جارٍ الإرسال…" : label}
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
