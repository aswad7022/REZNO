import { handlePublicStorageRequest } from "@/features/storage/api/http";
import { routeUuid } from "@/features/storage/api/validation";
import { createDownloadTarget } from "@/features/storage/services/storage-assets";

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  return handlePublicStorageRequest(request, "public.download", () =>
    createDownloadTarget(null, routeUuid(assetId, "assetId")));
}
