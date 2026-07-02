"use server";

import { TZDate } from "@date-fns/tz";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageOrganization } from "@/features/business/policies/access";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";

export interface PublicClosureState {
  status: "idle" | "success" | "error";
}

const closureSchema = z.object({
  branchId: z.string().uuid(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  reason: z.string().trim().max(500),
});

function localDateTime(value: string, timezone: string): Date {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(new TZDate(year, month - 1, day, hour, minute, timezone));
}

export async function createPublicClosure(
  _state: PublicClosureState,
  formData: FormData,
): Promise<PublicClosureState> {
  const identity = await requireBusinessIdentity();
  if (!canManageOrganization(identity.membership.role.systemRole)) {
    return { status: "error" };
  }
  const parsed = closureSchema.safeParse({
    branchId: formData.get("branchId"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { status: "error" };

  const branch = await prisma.branch.findFirst({
    where: {
      id: parsed.data.branchId,
      organizationId: identity.membership.organizationId,
      deletedAt: null,
    },
  });
  if (!branch) return { status: "error" };
  const startsAt = localDateTime(parsed.data.startsAt, branch.timezone);
  const endsAt = localDateTime(parsed.data.endsAt, branch.timezone);
  if (endsAt <= startsAt) return { status: "error" };

  await prisma.blockedTime.create({
    data: {
      branchId: branch.id,
      memberId: null,
      startsAt,
      endsAt,
      reason: parsed.data.reason || null,
    },
  });
  revalidatePath("/business/public-profile");
  revalidatePath(`/${identity.membership.organization.slug}`);
  return { status: "success" };
}

export async function deletePublicClosure(closureId: string): Promise<void> {
  const identity = await requireBusinessIdentity();
  if (!canManageOrganization(identity.membership.role.systemRole)) return;
  await prisma.blockedTime.deleteMany({
    where: {
      id: closureId,
      memberId: null,
      branch: { organizationId: identity.membership.organizationId },
    },
  });
  revalidatePath("/business/public-profile");
  revalidatePath(`/${identity.membership.organization.slug}`);
}
