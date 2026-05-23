import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace TS packages: Next must transpile them so `.js` extensions in
  // TS imports (TypeScript bundler-resolution convention) get rewritten.
  transpilePackages: ['@dungeon-hub/compendium-import', '@dungeon-hub/domain'],
};

export default config;
