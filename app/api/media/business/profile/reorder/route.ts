import type { NextRequest } from "next/server";
import { mediaReorder } from "@/features/media/api/http";

export const POST = (request: NextRequest) => mediaReorder(request, "business", { kind: "BUSINESS_PROFILE" });
