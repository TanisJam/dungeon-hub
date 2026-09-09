'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const INTERACTIVE_SELECTOR =
  'a[href], button:not([disabled]), input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';

const MIN_TAP_PX = 44;

interface TapIssue {
  tag: string;
  text: string;
  w: number;
  h: number;
}

/**
 * Frame375 — dev-only client component.
 * Constrains children to 375px max-width and runs a touch-target probe:
 * flags any interactive descendant whose bounding box is smaller than 44x44px.
 *
 * Satisfies DEV-COMP-02 (375px constraint) and DEV-COMP-03 (touch-target flag).
 */
export function Frame375({ children, label }: { children: ReactNode; label?: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [issues, setIssues] = useState<TapIssue[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: children isn't read in the effect body, but the probe must re-run whenever the rendered DOM content changes (new children → new measured elements).
  useEffect(() => {
    if (!frameRef.current) return;

    // Delay one frame so layout is stable
    const id = requestAnimationFrame(() => {
      if (!frameRef.current) return;
      const els = frameRef.current.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR);
      const found: TapIssue[] = [];

      els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width < MIN_TAP_PX || rect.height < MIN_TAP_PX) {
          found.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent ?? '').trim().slice(0, 32),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      });

      setIssues(found);
    });

    return () => cancelAnimationFrame(id);
  }, [children]);

  return (
    <div className="space-y-1">
      {label && (
        <div className="font-mono text-[10px] text-ink-mute">{label}</div>
      )}
      {/* 375px frame */}
      <div
        ref={frameRef}
        className="relative overflow-x-hidden border border-line rounded-md bg-paper"
        style={{ maxWidth: '375px', minWidth: '200px' }}
      >
        {children}
      </div>
      {/* Touch-target issues */}
      {issues.length > 0 && (
        <div className="space-y-1 mt-1">
          {issues.map((issue, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: dev-only debug overlay — issues is fully recomputed (not incrementally reordered) on every DOM probe, and has no natural id.
              key={i}
              className="flex items-center gap-2 px-2 py-1 rounded bg-warning-soft border border-warning-deep/30 text-[9px] font-mono"
            >
              <span className="text-warning-deep font-bold">TAP &lt;44px</span>
              <span className="text-ink-mute">
                &lt;{issue.tag}&gt; {issue.text ? `"${issue.text}"` : ''} — {issue.w}×{issue.h}px
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
