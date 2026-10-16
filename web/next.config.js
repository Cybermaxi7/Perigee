/** @type {import('next').NextConfig} */
const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./lib/i18n.ts');

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@creit.tech/stellar-wallets-kit"],
  turbopack: {},

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "stellar.creit.tech",
      },
    ],
  },

  // MIGRATION STATUS: Pages Router active
  // Explicit configuration to maintain Pages Router stability during migration.
  // Both pages/ and app/ directories can coexist during incremental migration.
  // Remove this comment and any Pages Router-specific config after full migration to App Router.
  // See MIGRATION.md for incremental migration plan.
  useFileSystemPublicRoutes: true,

  // Pin to current stable behaviour
  // Remove experimental flag when migrating to App Router
  experimental: {
    // App Router will be enabled incrementally
    // See MIGRATION.md for migration phases

    /**
     * Optimise CSS — removes unused Tailwind classes at build time via
     * the Lightning CSS minifier bundled with Next.js.
     *
     * Resolves #686 — Optimize bundle size.
     */
    optimizeCss: true,
  },

  /**
   * Webpack customisations for bundle-size reduction.
   *
   * Resolves #686 — Optimize bundle size.
   *
   * Changes:
   *  1. `mermaid` is a large library (~1.5 MB) used only in the result viewer.
   *     We mark it as an async chunk so it is loaded on-demand rather than
   *     included in the initial JS bundle.
   *  2. Moment.js (pulled in transitively) includes all locale data by default.
   *     We use `IgnorePlugin` to strip unused locales (~300 KB savings).
   *  3. Third-party packages that are already shipped as ES modules (e.g.
   *     framer-motion, lucide-react) are placed in a dedicated vendor chunk so
   *     they are cached independently and don't bust the app chunk on every
   *     deploy.
   */
  webpack(config, { isServer }) {
    // 1. Split mermaid into its own async chunk
    config.optimization = config.optimization ?? {};
    config.optimization.splitChunks = {
      ...(config.optimization.splitChunks ?? {}),
      cacheGroups: {
        ...(config.optimization.splitChunks?.cacheGroups ?? {}),
        mermaid: {
          test: /[\\/]node_modules[\\/]mermaid[\\/]/,
          name: "vendor-mermaid",
          chunks: "async",
          priority: 30,
          enforce: true,
        },
        // 3. Stable vendor chunk for large UI / animation libraries
        uiVendors: {
          test: /[\\/]node_modules[\\/](framer-motion|lucide-react|@tanstack)[\\/]/,
          name: "vendor-ui",
          chunks: "all",
          priority: 20,
          enforce: true,
        },
      },
    };

    // 2. Drop unused moment.js locales (no-op if moment is not in the graph)
    if (!isServer) {
      const webpack = require("webpack");
      config.plugins = config.plugins ?? [];
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^\.\/locale$/,
          contextRegExp: /moment$/,
        }),
      );
    }

    return config;
  },

  async headers() {
    return [
      {
        source: "/:path*.wasm",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/api/wasm/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
