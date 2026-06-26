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
