import type { NextRequest } from "next/server";
import { mediaAttach, mediaGet } from "@/features/media/api/http";

const target = { kind: "BUSINESS_PROFILE" } as const;
export const GET = (request: NextRequest) => mediaGet(request, "business", target);
export const POST = (request: NextRequest) => mediaAttach(request, "business", target);
export const PUT = (request: NextRequest) => mediaAttach(request, "business", target, true);
