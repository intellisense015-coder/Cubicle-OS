/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const scriptSources = ["'self'", "'unsafe-inline'"];

// Next.js development tooling may require eval-based transforms. Production
// must not allow them because they weaken the CSP against script injection.
if (!isProduction) scriptSources.push("'unsafe-eval'");

const nextConfig = {
  // Keep tracing inside this Next.js project. Vercel's project root is already
  // Cubicle-OS, so tracing from the parent directory can produce duplicated
  // deployment paths such as /vercel/path0/path0.
  outputFileTracingRoot: projectDir,
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "img-src 'self' data: blob: https://*.supabase.co",
          "style-src 'self' 'unsafe-inline'",
          `script-src ${scriptSources.join(" ")}`,
          "font-src 'self' data:",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
          "frame-ancestors 'self'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
          "manifest-src 'self'",
          "worker-src 'self' blob:",
        ].join("; "),
      },
    ];

    // HSTS is intentionally production-only. It must never be emitted by a
    // local HTTP development server, where it can affect future browser access.
    if (isProduction) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      }
    ];
  }
};

export default nextConfig;
