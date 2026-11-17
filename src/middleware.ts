import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/security/csp";

/**
 * A fresh CSP nonce for every page. Next.js reads the nonce from the request's CSP header and puts it on its
 * own scripts; the root layout reads x-nonce for the one inline script we write (the theme boot).
 */
export function middleware(request: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API routes, static files and the service worker have their own headers.
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|brand|sw.js|crisis-preview).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
