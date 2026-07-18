import { randomUUID } from "node:crypto";

import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { AdminCategoryForm } from "@/features/commerce/components/admin-commerce-forms";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";

export default async function NewAdminCategoryPage() {
  await requireAuthenticatedCommerceAdmin("COMMERCE_CATALOG_MODERATE");
  return <><AdminPageHeader title="إنشاء فئة" description="تُنشأ الفئة ACTIVE ولا يمكن حذفها نهائيًا." /><AdminCategoryForm categoryId={randomUUID()} idempotencyKey={randomUUID()} /></>;
}
