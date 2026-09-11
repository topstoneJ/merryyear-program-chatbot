import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: { "/*": ["./.local-data/**/*", "./local-data/**/*", "./uploads/**/*", "./backups/**/*", "./.env*"] },
  turbopack: { root: process.cwd() },
};

export default nextConfig;
