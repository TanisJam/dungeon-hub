import '@testing-library/react';

// Radix UI primitives (Popper, HoverCard, etc.) use ResizeObserver internally.
// jsdom does not implement it, so we stub it here for all test files.
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
