/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: '/studio',
  // Allow the landing page at / to be served by Vercel as a static file
  // while the full Next.js app lives at /studio
};

export default nextConfig;
