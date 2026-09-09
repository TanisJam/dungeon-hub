import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// React tree cleanup between tests — without this, jsdom accumulates DOM from
// every `render()` across the whole file, and queries like getByRole start
// returning matches from previous tests' leftover trees. Centralizing it here
// means component test files don't have to remember.
// Guarded for the node environment (pure-logic .test.ts) where there is no DOM —
// this setup file runs for every test regardless of its environment.
afterEach(() => {
  if (typeof document !== 'undefined') cleanup();
});

// Radix UI primitives (Popper, HoverCard, etc.) use ResizeObserver internally.
// jsdom does not implement it, so we stub it here for all test files.
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Web Storage in the jsdom environment.
//
// Node 22.4+ ships experimental Web Storage globals. From Node 26 both
// `localStorage` and `sessionStorage` exist on `globalThis`, but `localStorage`
// evaluates to `undefined` unless the process was started with
// `--localstorage-file`. Vitest populates the jsdom global only with window
// properties that are *not* already present on the Node global, so it skips the
// name and that `undefined` is what tests get — `localStorage.clear()` then
// fails with "Cannot read properties of undefined".
//
// Defining the store here keeps the suite working on any Node version: on
// runtimes where jsdom's own localStorage survives, the guard is a no-op.
if (typeof document !== 'undefined' && typeof localStorage === 'undefined') {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    getItem(key: string) {
      const value = entries.get(String(key));
      return value === undefined ? null : value;
    },
    setItem(key: string, value: string) {
      entries.set(String(key), String(value));
    },
    removeItem(key: string) {
      entries.delete(String(key));
    },
    clear() {
      entries.clear();
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });
}
