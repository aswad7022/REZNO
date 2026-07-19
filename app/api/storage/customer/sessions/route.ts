import type { NextRequest } from "next/server";

import { handleStorageRequest } from "@/features/storage/api/http";
import { parseCreateSession, parseSessionListQuery } from "@/features/storage/api/validation";
import { createUploadSession } from "@/features/storage/services/storage-mutations";
import { listUploadSessions } from "@/features/storage/services/storage-query";

export function GET(request: NextRequest) {
  return handleStorageRequest(request, "customer", "sessions.list", (actor) =>
    listUploadSessions(actor, parseSessionListQuery(request.nextUrl)));
}

export function POST(request: NextRequest) {
  return handleStorageRequest(request, "customer", "sessions.create", async (actor) =>
    createUploadSession(actor, await parseCreateSession(request)), 12);
}
