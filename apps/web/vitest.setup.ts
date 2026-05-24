import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// React tree cleanup between tests — without this, jsdom accumulates DOM from
// every `render()` across the whole file, and queries like getByRole start
// returning matches from previous tests' leftover trees. Centralizing it here
// means component test files don't have to remember.
afterEach(cleanup);

// Radix UI primitives (Popper, HoverCard, etc.) use ResizeObserver internally.
// jsdom does not implement it, so we stub it here for all test files.
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
