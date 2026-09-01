import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';

const intlMiddleware = createMiddleware({
  // รายการภาษาท้องถิ่นทั้งหมดที่รองรับ
  locales: ['en'],
 
  // ใช้เมื่อไม่มีภาษาท้องถิ่นที่ตรงกัน
  defaultLocale: 'en',
  localePrefix: 'never'
});

export default function middleware(request: NextRequest) {
  const localePrefixMatch = request.nextUrl.pathname.match(/^\/(?:en|th)(\/.*)?$/);

  if (localePrefixMatch) {
    const url = request.nextUrl.clone();
    url.pathname = localePrefixMatch[1] || '/';
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}
 
export const config = {
  matcher: ['/((?!api|livez|_next|_vercel|manifest\\.json|manifest\\.webmanifest|sw\\.js|icons|favicon\\.ico|.*\\..*).*)']
};