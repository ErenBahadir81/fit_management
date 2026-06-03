import { NextRequest, NextResponse } from "next/server";

const COOKIE = "fit_uid";

export function middleware(req: NextRequest) {
  const uid = req.cookies.get(COOKIE)?.value;
  const { pathname } = req.nextUrl;
  const isLogin = pathname === "/login";

  if (!uid && !isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (uid && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
