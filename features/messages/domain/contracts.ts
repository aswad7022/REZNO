import { createHash } from "node:crypto";

import type { SystemRole } from "@prisma/client";

export type CustomerMessageActor = {
  kind: "customer";
  personId: string;
  userId: string;
};

export type BusinessMessageActor = {
  kind: "business";
  membershipId: string;
  organizationId: string;
  personId: string;
  roleId: string;
  systemRole: SystemRole;
  userId: string;
};

export type AdminMessageActor = {
  adminSource: "database" | "env";
  canSend: boolean;
  kind: "admin";
  personId: string;
  userId: string;
};

export type MessageActor =
  | AdminMessageActor
  | BusinessMessageActor
  | CustomerMessageActor;

export function messageActorScopeKey(actor: MessageActor) {
  if (actor.kind === "customer") return `customer:${actor.personId}`;
  if (actor.kind === "admin") return `admin:${actor.userId}`;
  return [
    "business",
    actor.personId,
    actor.organizationId,
    actor.membershipId,
    actor.roleId,
    actor.systemRole,
  ].join(":");
}

export function messageRequestHash(value: Record<string, unknown>) {
  return createHash("sha256")
    .update(`rezno-message-request:${canonicalJson(value)}`)
    .digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
