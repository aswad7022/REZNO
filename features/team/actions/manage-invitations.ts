"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { BusinessOperationsError } from "@/features/business-operations/domain/errors";
import {
  acceptOperationalInvitation,
  declineOperationalInvitation,
} from "@/features/business-operations/services/invitations";
import {
  ACTIVE_BUSINESS_COOKIE,
  requireCustomerIdentity,
} from "@/features/identity/server";
import { logServerError } from "@/lib/logging/server";

export interface WorkInvitationActionState {
  status: "idle" | "success" | "error";
  message?: string;
  replayed?: boolean;
}

const invitationIdSchema = z.string().uuid();
const keySchema = z.string().uuid();

export async function acceptWorkInvitation(
  invitationId: string,
  _previousState: WorkInvitationActionState,
  formData: FormData,
): Promise<WorkInvitationActionState> {
  const [identity, t] = await Promise.all([
    requireCustomerIdentity(),
    getTranslations("WorkInvitations.messages"),
  ]);
  const parsedId = invitationIdSchema.safeParse(invitationId);
  const parsedKey = keySchema.safeParse(formData.get("idempotencyKey"));
  if (!parsedId.success || !parsedKey.success) return { status: "error", message: t("notFound") };
  try {
    const result = await acceptOperationalInvitation({
      email: identity.session.user.email,
      idempotencyKey: parsedKey.data,
      invitationId: parsedId.data,
      personId: identity.person.id,
    });
    (await cookies()).set(ACTIVE_BUSINESS_COOKIE, result.organizationId ?? "", {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 180,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    revalidatePath("/customer/work-invitations");
    revalidatePath("/business");
    return { status: "success", message: t("accepted"), replayed: result.replayed };
  } catch (error) {
    if (error instanceof BusinessOperationsError) {
      return { status: "error", message: error.code === "INVITATION_EXPIRED" ? t("expired") : t("notFound") };
    }
    logServerError("workInvitation.accept", error, { invitationId: parsedId.data });
    return { status: "error", message: t("failure") };
  }
}

export async function declineWorkInvitation(
  invitationId: string,
  _previousState: WorkInvitationActionState,
): Promise<WorkInvitationActionState> {
  void _previousState;
  const [identity, t] = await Promise.all([
    requireCustomerIdentity(),
    getTranslations("WorkInvitations.messages"),
  ]);
  const parsedId = invitationIdSchema.safeParse(invitationId);
  if (!parsedId.success) return { status: "error", message: t("notFound") };
  try {
    const result = await declineOperationalInvitation({
      email: identity.session.user.email,
      invitationId: parsedId.data,
      personId: identity.person.id,
    });
    revalidatePath("/customer/work-invitations");
    return { status: result.status === "EXPIRED" ? "error" : "success", message: result.status === "EXPIRED" ? t("expired") : t("declined") };
  } catch (error) {
    if (error instanceof BusinessOperationsError) return { status: "error", message: t("notFound") };
    logServerError("workInvitation.decline", error, { invitationId: parsedId.data });
    return { status: "error", message: t("failure") };
  }
}
