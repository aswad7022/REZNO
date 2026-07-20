import type { NextRequest } from "next/server";
import { mediaAttach, mediaGet } from "@/features/media/api/http";

const target = { kind: "CUSTOMER_PROFILE" } as const;
export const GET = (request: NextRequest) => mediaGet(request, "customer", target);
export const POST = (request: NextRequest) => mediaAttach(request, "customer", target);
export const PUT = (request: NextRequest) => mediaAttach(request, "customer", target, true);
