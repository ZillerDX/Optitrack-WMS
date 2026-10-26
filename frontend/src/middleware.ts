import { NextRequest, NextResponse } from 'next/server';

/**
 * The app is English only and has no locale segment. Old links that carry one (/en/login, /th/dashboard)
 * are sent to the same page without it.
 */
export default function middleware(request: NextRequest) {
  const prefixed = request.nextUrl.pathname.match(/^\/(?:en|th)(\/.*)?$/);
  if (prefixed) {
    const url = request.nextUrl.clone();
    url.pathname = prefixed[1] || '/';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/en', '/en/:path*', '/th', '/th/:path*'],
};
