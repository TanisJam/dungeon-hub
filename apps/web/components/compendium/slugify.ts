// Subpath import targets `normalize.ts` directly — zero Node deps, browser-safe.
// The package's main entry pulls in importers with `node:fs`, which would
// break the web bundle. Subpath keeps slugify isolated.
export { slugify } from '@dungeon-hub/compendium-import/slugify';
