import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/@duckdb/node-api/**/*",
      "node_modules/@duckdb/node-bindings/**/*",
      "node_modules/@duckdb/node-bindings-linux-x64/**/*",
    ],
  },
  serverExternalPackages: ["@duckdb/node-api"],
};

export default nextConfig;
