import { permanentRedirect } from "next/navigation";

export default async function LegacyBusinessProfileRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  permanentRedirect(`/${(await params).slug}`);
}
