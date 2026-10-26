/** @type {import('next').NextConfig} */
const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const isDev = process.env.NODE_ENV !== 'production';
// Vercel's preview toolbar/comments need vercel.live; never allow it in production.
const isPreview = process.env.VERCEL_ENV === 'preview';

// Content-Security-Policy. Pages are statically generated, so a per-request nonce is not
// available and inline bootstrap scripts need 'unsafe-inline'. That means this CSP does
// NOT stop an injected inline <script>; what it does enforce: no third-party scripts
// (only self + Google Sign-In), no plugins, no <base>/form hijacking, no framing, and
// data can only be sent to this origin, Google sign-in and the exchange-rate API.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client${isDev ? " 'unsafe-eval'" : ''}${isPreview ? ' https://vercel.live' : ''}`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self' https://accounts.google.com/gsi/ https://open.er-api.com${isDev ? ' ws:' : ''}${isPreview ? ' https://vercel.live wss://ws-us3.pusher.com' : ''}`,
  "frame-src https://accounts.google.com/gsi/" + (isPreview ? ' https://vercel.live' : ''),
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  isDev ? '' : 'upgrade-insecure-requests',
].filter(Boolean).join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
];

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    // Avatars are Google profile pictures or data URLs (see src/lib/validation.ts);
    // the optimizer must not be a proxy for arbitrary hosts.
    remotePatterns: [
      { protocol: 'https', hostname: '*.googleusercontent.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
