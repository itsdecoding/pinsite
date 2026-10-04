/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Route /studio paths to the internal Agency OS pages
      {
        source: '/studio/login',
        destination: '/login',
      },
      {
        source: '/studio/signup',
        destination: '/signup',
      },
      {
        source: '/studio/forgot-password',
        destination: '/forgot-password',
      },
      {
        source: '/studio/reset-password',
        destination: '/reset-password',
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
    ];
  },
  async redirects() {
    return [
      {
        source: '/queue',
        destination: '/studio/queue',
        permanent: true,
      },
      {
        source: '/comms',
        destination: '/studio/comms',
        permanent: true,
      },
      {
        source: '/dashboard',
        destination: '/studio/dashboard',
        permanent: true,
      },
      {
        source: '/projects',
        destination: '/studio/projects',
        permanent: true,
      },
      {
        source: '/manager/:path*',
        destination: '/studio/manager/:path*',
        permanent: true,
      },
      {
        source: '/login',
        destination: '/studio/login',
        permanent: true,
      },
      {
        source: '/signup',
        destination: '/studio/signup',
        permanent: true,
      },
      {
        source: '/forgot-password',
        destination: '/studio/forgot-password',
        permanent: true,
      },
      {
        source: '/reset-password',
        destination: '/studio/reset-password',
        permanent: true,
      },
      {
        source: '/me',
        destination: '/studio/me',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
