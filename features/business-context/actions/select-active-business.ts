"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ACTIVE_BUSINESS_COOKIE,
  getBusinessContextState,
} from "@/features/identity/server";
import { getSafeBusinessReturnPath } from "@/features/business-context/utils/return-path";

function getSafeNext(value: FormDataEntryValue | null) {
  return getSafeBusinessReturnPath(typeof value === "string" ? value : null);
}

export async function selectActiveBusiness(formData: FormData) {
  const businessId = formData.get("businessId");
  const next = getSafeNext(formData.get("next"));

  if (typeof businessId !== "string") {
    redirect("/select-business?next=/business");
  }

  const context = await getBusinessContextState();
  const allowed = context.accessibleBusinesses.some(
    (business) => business.id === businessId,
  );

  if (!allowed) {
    redirect("/select-business?next=/business");
  }

  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 180,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/business", "layout");
  revalidatePath(next);

  redirect(next);
}
