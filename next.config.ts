import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  async redirects() {
    return [
      { source: "/rankings", destination: "/", permanent: false },
      { source: "/team", destination: "/", permanent: false },
      { source: "/tracker", destination: "/", permanent: false },
      { source: "/forecast", destination: "/", permanent: false },
      { source: "/news", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
