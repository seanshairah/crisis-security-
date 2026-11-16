import type { NextConfig } from "next";

// Operate in the company's local time so shift times read as the guards see them.
process.env.TZ = process.env.TIMEZONE || "Africa/Harare";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (copied from .next/standalone); harmless on Vercel.
  output: "standalone",
  reactStrictMode: true,
  // There is no Play Store: guards install and update from /api/app/download, so the APK and the
  // manifest describing it have to travel with the serverless bundle. Only files a route imports
  // are traced automatically, and these are read at runtime by path.
  outputFileTracingIncludes: {
    "/api/app/download": ["./artifacts/android/security-gateway-release.apk", "./artifacts/android/release.json"],
    "/api/app/version": ["./artifacts/android/release.json"],
    "/api/gateways/heartbeat": ["./artifacts/android/release.json"],
  },
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon", "@neondatabase/serverless", "ws", "https-proxy-agent", "bcryptjs", "web-push"],
  // Security headers for every response. HSTS only in production (local http must keep working).
  async headers() {
    const common = [
      { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com https://api.mapbox.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Browser geolocation is used by the site picker on this origin only; nothing else needs device sensors.
      { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];
    const hsts = process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : [];
    return [{ source: "/(.*)", headers: [...common, ...hsts] }];
  },
};

export default nextConfig;
