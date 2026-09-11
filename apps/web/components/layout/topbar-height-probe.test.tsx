import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

const mockUsePathname = vi.fn(() => '/inicio');
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

import { TopbarHeightProbe } from './topbar-height-probe';

/**
 * Regression coverage for the bug this component caused on its first outing:
 * it published a zero height read during a route transition, which pinned every
 * offset derived from --topbar-h to the top of the viewport and pushed the
 * /mapa hex-list button from 24px under the header to 80px under it.
 *
 * jsdom reports 0 for every getBoundingClientRect by default, so each test
 * states the height it is exercising rather than relying on that default.
 */
function mountHeader(height: number): HTMLElement {
  const header = document.createElement('header');
  header.setAttribute('data-app-topbar', '');
  header.getBoundingClientRect = () =>
    ({ height, width: 375, top: 0, left: 0, right: 375, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(header);
  return header;
}

function publishedValue(): string {
  return document.documentElement.style.getPropertyValue('--topbar-h');
}

/**
 * vitest.setup.ts installs a no-op ResizeObserver stub, which means a test
 * cannot drive a re-measure through it. This one records the callback so a
 * test can fire it deliberately — without that, a test asserting on "the
 * observer fires again" asserts on nothing and passes whatever the code does.
 */
let fireResize: (() => void) | null = null;
let pendingFrames: FrameRequestCallback[] = [];

/** Drain any frame callbacks the component scheduled after the initial mount. */
function flushFrames(): void {
  const queued = pendingFrames.splice(0);
  for (const cb of queued) cb(0);
}
class RecordingResizeObserver {
  constructor(cb: () => void) {
    fireResize = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {
    fireResize = null;
  }
}

describe('TopbarHeightProbe', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--topbar-h');
    // The component defers its first read a frame; run it synchronously.
    pendingFrames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      // Run immediately AND record, so a test can drive a later coalesced pass.
      cb(0);
      pendingFrames.push(cb);
      return pendingFrames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    fireResize = null;
    vi.stubGlobal('ResizeObserver', RecordingResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const el of document.querySelectorAll('[data-app-topbar]')) {
      el.remove();
    }
  });

  it('T1: publishes the measured header height', () => {
    mountHeader(88);
    render(<TopbarHeightProbe />);
    expect(publishedValue()).toBe('88px');
  });

  it('T2: does NOT publish a zero height — that is a hidden header, not a measurement', () => {
    mountHeader(0);
    render(<TopbarHeightProbe />);
    expect(publishedValue()).toBe('');
  });

  it('T3: a later zero reading never overwrites a good one', () => {
    const header = mountHeader(88);
    render(<TopbarHeightProbe />);
    expect(publishedValue()).toBe('88px');

    // The header gets hidden mid-transition and the observer fires again.
    header.getBoundingClientRect = () =>
      ({ height: 0, width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    expect(fireResize).not.toBeNull();
    fireResize?.();
    expect(publishedValue()).toBe('88px');
  });

  it('T3b: a later NON-zero reading does update the published value', () => {
    const header = mountHeader(88);
    render(<TopbarHeightProbe />);
    expect(publishedValue()).toBe('88px');

    // The world switcher appears under the title and the header grows.
    header.getBoundingClientRect = () =>
      ({ height: 107, width: 375, top: 0, left: 0, right: 375, bottom: 107, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireResize?.();
    expect(publishedValue()).toBe('107px');
  });

  it('T3c: re-targets when the header NODE is replaced, not just resized', () => {
    // This is the real-world sequence: a segment's loading.tsx renders its own
    // AppShell (shorter header, no worldSwitcher), then the real page swaps in a
    // taller one. A ResizeObserver left on the old node never fires again — this
    // shipped a stale 69px while the live header measured 88px.
    const loadingHeader = mountHeader(69);
    render(<TopbarHeightProbe />);
    expect(publishedValue()).toBe('69px');

    loadingHeader.remove();
    mountHeader(88);
    // The component coalesces its re-target into a frame; the stub runs it now.
    flushFrames();

    expect(publishedValue()).toBe('88px');
  });

  it('T4: renders nothing and survives a route with no topbar', () => {
    const { container } = render(<TopbarHeightProbe />);
    expect(container.innerHTML).toBe('');
    expect(publishedValue()).toBe('');
  });
});
