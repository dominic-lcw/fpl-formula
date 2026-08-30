import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**/*"],
  },
  serverExternalPackages: ["@duckdb/node-api"],
};

export default nextConfig;
