import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src 'none'",
      "form-action 'self'",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  async redirects() {
    return [
      // Old OASIS comparison routes → new generic Tenaqo comparison page (permanent 301)
      {
        source: "/compare/oasis-vs-landlordstudio",
        destination: "/compare/tenaqo-vs-landlord-management-apps",
        permanent: true,
      },
      {
        source: "/compare/oasis-vs-buildium",
        destination: "/compare/tenaqo-vs-landlord-management-apps",
        permanent: true,
      },
      {
        source: "/compare/oasis-vs-tenantcloud",
        destination: "/compare/tenaqo-vs-landlord-management-apps",
        permanent: true,
      },
      {
        source: "/pl/compare/oasis-vs-landlordstudio",
        destination: "/pl/compare/tenaqo-vs-landlord-management-apps",
        permanent: true,
      },
      // German locale fully withdrawn.
      // The German comparison route is redirected directly (single hop) rather than letting the
      // catch-all produce a chain via /compare/oasis-vs-landlordstudio.
      {
        source: "/de/compare/:slug*",
        destination: "/compare/tenaqo-vs-landlord-management-apps",
        permanent: true,
      },
      // /de/:path+ (one-or-more) skips the bare /de so middleware.ts handles that exact case.
      // next.config.mjs redirects run before middleware; :path* (zero-or-more) would intercept /de and produce empty Location.
      {
        source: "/de/:path+",
        destination: "/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
