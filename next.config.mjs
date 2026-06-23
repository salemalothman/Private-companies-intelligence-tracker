/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // pdf-parse is a CommonJS lib with dynamic requires — keep it out of the bundle.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
