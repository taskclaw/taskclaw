import type { NextConfig } from "next";

// Host portability for Next.js Server Actions.
//
// Server Actions reject a POST when the request Origin doesn't match the
// forwarded host (a CSRF guard). Behind the single-origin gateway, Kong (nginx)
// derives X-Forwarded-Host from $host, which DROPS the port — so on any non-80/
// 443 port the forwarded host (1.2.3.4) never matches the browser Origin
// (1.2.3.4:3000) and every server action 500s with "Invalid Server Actions
// request". This can't be fixed at the gateway with OSS Kong.
//
// Fix: explicitly allow this deployment's own origin. Derived from SITE_URL at
// RUNTIME (`next start` re-reads this config on boot, so process.env is the
// container's runtime env) — so ONE published image works on localhost, any
// IP:port, or a domain with no rebuild. ALLOWED_ORIGINS can add extra hosts.
const siteHost = (process.env.SITE_URL ?? "")
  .replace(/^https?:\/\//, "")
  .replace(/\/.*$/, "")
  .trim();
const allowedOrigins = [siteHost, ...(process.env.ALLOWED_ORIGINS ?? "").split(",")]
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // Skip ESLint during Docker build
  },
  ...(allowedOrigins.length
    ? { experimental: { serverActions: { allowedOrigins } } }
    : {}),
};

export default nextConfig;
