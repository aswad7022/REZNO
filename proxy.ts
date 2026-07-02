import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const currentPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  requestHeaders.set("x-rezno-current-path", currentPath);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/business/:path*"],
};
