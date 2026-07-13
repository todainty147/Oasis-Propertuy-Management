import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js cannot redirect to "/" as a destination in next.config.mjs redirects (produces empty Location).
// Handle /de exact root here and preserve any query string.
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/";
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: "/de",
};
