import type { NextConfig } from "next";

// @bullpen/ui and @bullpen/contracts ship TypeScript source (no build step,
// see their package.json `main`/`types` fields), so Next must transpile
// them itself rather than expecting pre-compiled JS in node_modules.
const nextConfig: NextConfig = {
  transpilePackages: ["@bullpen/ui", "@bullpen/contracts"],
  // Both workspace packages use NodeNext-style relative imports
  // ("./cost.js" resolving to "./cost.ts"). Turbopack (Next 16's default
  // bundler) has no equivalent of webpack's `resolve.extensionAlias` for
  // remapping a literal ".js" specifier onto a ".ts" source file in a
  // transpiled package, so this app builds with `next build --webpack`
  // / `next dev --webpack` (see package.json) instead, where the alias
  // below is applied.
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
