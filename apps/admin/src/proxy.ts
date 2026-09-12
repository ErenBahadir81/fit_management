import { NextResponse, type NextRequest } from "next/server";

/**
 * A server component cannot read the pathname it is rendering, so the panel's auth gate had
 * no way to tell /login where the visitor was actually heading — every expired session landed
 * back on the dashboard. This stamps the path on the request so `(panel)/layout.tsx` can build
 * `/login?next=…` and send the user on to the page they asked for.
 */
export const PATHNAME_HEADER = "x-fitfloow-pathname";

export function proxy(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Pages only: the API rewrite, build assets and the favicon never need the header.
  matcher: ["/((?!api/|_next/|favicon.ico).*)"],
};
