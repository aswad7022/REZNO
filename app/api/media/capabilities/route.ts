import { NextResponse } from "next/server";

import { storageMediaCapabilities } from "@/features/media/services/capabilities";
import { mediaErrorResponse } from "@/features/media/api/http";
import { assertNoMediaQuery } from "@/features/media/api/validation";

export function GET(request: Request) {
  try {
    assertNoMediaQuery(request);
    return NextResponse.json(
      { data: storageMediaCapabilities() },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return mediaErrorResponse(error, "capabilities");
  }
}
