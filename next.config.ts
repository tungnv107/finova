import type { NextConfig } from "next";
import path from "node:path";

// Start as Report-Only until authenticated Google and mobile browser acceptance.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://accounts.google.com https://www.googleapis.com",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Allow an isolated validation build alongside an existing local .next tree.
  distDir: process.env.FINOVA_NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep generated Prisma code on the Node side; it is outside node_modules.
  serverExternalPackages: ["@finova/prisma", "@prisma/client", "prisma"],
  // Restrict production file tracing to this application on Windows.
  outputFileTracingRoot: path.resolve(process.cwd()),
  webpack(webpackConfig, { dev, isServer }) {
    if (process.platform === "win32" && isServer && !dev) {
      // Next 16's entrypoint tracer can traverse Windows user profiles beyond
      // the configured tracing root and encounter inaccessible Docker sockets.
      // On Windows production builds, exclude this external profile tree.
      for (const plugin of webpackConfig.plugins ?? []) {
        if (plugin && plugin.constructor.name === "TraceEntryPointsPlugin" && "traceIgnores" in plugin) {
          (plugin as unknown as { traceIgnores: string[] }).traceIgnores.push("**/Users/**");
        }
      }
    }
    return webpackConfig;
  },
  experimental: {
    // Required to return HTTP 403 for denied admin pages (Next.js 16).
    authInterrupts: true,
    cpus: process.platform === "win32" ? 1 : 2,
    // Serialize Windows prerender writes to avoid intermittent EPERM mkdir.
    staticGenerationMaxConcurrency: process.platform === "win32" ? 1 : 8,
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "X-DNS-Prefetch-Control", value: "off" },
        { key: process.env.FINOVA_CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
      ],
    }];
  },
};

export default nextConfig;
