/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // build 100% estático → Cloudflare Pages
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true }, // lint roda separado (npm run lint)
};
export default nextConfig;
