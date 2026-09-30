/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        // Serve the marketing landing page at root
        {
          source: '/',
          destination: '/landing.html',
        },
      ],
      afterFiles: [
        // Route /studio paths to the corresponding internal Agency OS pages
        {
          source: '/studio/login',
          destination: '/login',
        },
        {
          source: '/studio/signup',
          destination: '/signup',
        },
        {
          source: '/studio/queue',
          destination: '/queue',
        },
        {
          source: '/studio/dashboard',
          destination: '/dashboard',
        },
        {
          source: '/studio/projects',
          destination: '/projects',
        },
        {
          source: '/studio/comms',
          destination: '/comms',
        },
        {
          source: '/studio/me',
          destination: '/me',
        },
        {
          source: '/studio/manager/:path*',
          destination: '/manager/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
