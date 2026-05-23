import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace TS packages: Next must transpile them so `.js` extensions in
  // TS imports (TypeScript bundler-resolution convention) get rewritten.
  transpilePackages: ['@dungeon-hub/compendium-import', '@dungeon-hub/domain'],
  // Webpack: TS NodeNext convention uses `.js` extensions in source imports
  // that actually resolve to `.ts`. transpilePackages alone doesn't rewrite
  // cross-file internal imports in workspace packages; this alias does.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

export default config;
