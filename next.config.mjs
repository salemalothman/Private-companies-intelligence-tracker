import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // pdf-parse is a CommonJS lib with dynamic requires — keep it out of the bundle.
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    // PDF uploads go through a Server Action, whose request body defaults to
    // 1MB — too small for most PDFs, so the upload fails at the transport layer
    // as "TypeError: Failed to fetch". Allow documents up to 15MB.
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;

// Enables Cloudflare bindings (env, R2, etc.) during `next dev` — opt-in only.
// Unconditional init hijacks plain `next dev` middleware handling ("runMiddleware
// should not be called with OpenNext") now that wrangler `main` is the custom
// worker entry. Set NEXT_DEV_CLOUDFLARE=1 to develop against workerd bindings;
// the production OpenNext build (`opennextjs-cloudflare build`) never needs this.
if (process.env.NEXT_DEV_CLOUDFLARE === "1") {
  initOpenNextCloudflareForDev();
}
