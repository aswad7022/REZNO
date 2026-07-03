import { permanentRedirect } from "next/navigation";

import { getPublicBusinessPath } from "@/features/business/lib/business-slug";

export default async function LegacyBusinessProfileRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  permanentRedirect(getPublicBusinessPath((await params).slug));
}
