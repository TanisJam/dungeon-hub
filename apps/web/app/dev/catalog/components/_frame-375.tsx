'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// `button:not([disabled])` was already here; input/select/textarea were not held
// to the same rule, so a greyed-out control counted as a tap target that missed
// the minimum. A disabled control is not a target at all.
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]',
  '[role="link"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const MIN_TAP_PX = 44;

interface TapIssue {
  tag: string;
  text: string;
  w: number;
  h: number;
}

/**
 * Serialised onto each flagged row as `data-tap-issue`. The visible badge is for
 * a human reading the catalog; this attribute is what e2e/tap-targets.public.spec.ts
 * reads, so the assertion and the probe never drift into two definitions of the
 * same rule. Naming the entry and variant here is what lets a failure say which
 * registry entry to open rather than just "a button somewhere was 34px".
 */
export interface TapIssuePayload extends TapIssue {
  entry: string;
  variant: string;
}

export const TAP_ISSUE_ATTR = 'data-tap-issue';

/**
 * Marks a Frame375 in the server HTML. Counting `[style*="375px"]` instead would
 * over-count: the `preview: 'bare'` entries draw their own 375px frames, which
 * no probe ever visits.
 */
export const FRAME_ATTR = 'data-tap-frame';

/** Set on a frame once its probe has actually measured. See the effect below. */
export const PROBED_ATTR = 'data-tap-probed';

/**
 * True when `el` is a run of text rather than a box — a compendium term carrying
 * a hover card mid-sentence, a link inside a paragraph.
 *
 * WCAG 2.5.8 exempts these by name: "the target is in a sentence or its size is
 * otherwise constrained by the line-height of non-target text". The test here is
 * the computed display alone, and that is not a shortcut — `height` and
 * `min-height` do not apply to non-replaced inline elements at all, so there is
 * no declaration that would make this element 44px tall. Its height IS the line
 * height of the text it sits in. Reporting it asks for something CSS cannot
 * express, and the only way to satisfy the number would be to inflate the leading
 * of the surrounding paragraph.
 *
 * Anything the layout has made block, flex or inline-block CAN be sized, so it
 * stays measured — including an inline-block that merely looks like a word.
 */
function isInlineText(el: HTMLElement): boolean {
  return el.ownerDocument.defaultView?.getComputedStyle(el).display === 'inline';
}

/**
 * The element whose box is the actual tap target for `el`.
 *
 * For everything except checkboxes and radios that is `el` itself. Those two
 * render a fixed ~13×13px box the page cannot resize, and the thing a finger
 * actually lands on is the label — which is why `<label>` toggles the control at
 * all. So when a label owns the control, the label is what gets measured.
 *
 * A control with no label falls through and is reported as-is: that is a real
 * defect, and one worth keeping visible.
 */
function tapTargetFor(el: HTMLElement): HTMLElement {
  const type = el.getAttribute('type');
  if (el.tagName !== 'INPUT' || (type !== 'checkbox' && type !== 'radio')) return el;

  const wrapping = el.closest('label');
  if (wrapping) return wrapping;

  const id = el.getAttribute('id');
  if (id) {
    // CSS.escape guards ids that are valid in HTML but not in a selector.
    const forLabel = el.ownerDocument.querySelector<HTMLElement>(`label[for="${CSS.escape(id)}"]`);
    if (forLabel) return forLabel;
  }
  return el;
}

/**
 * Frame375 — dev-only client component.
 * Constrains children to 375px max-width and runs a touch-target probe:
 * flags any interactive descendant whose bounding box is smaller than 44x44px.
 *
 * Satisfies DEV-COMP-02 (375px constraint) and DEV-COMP-03 (touch-target flag).
 */
export function Frame375({
  children,
  label,
  entry,
}: {
  children: ReactNode;
  label?: string;
  entry?: string;
}) {
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
        if (isInlineText(el)) return;

        // A checkbox or radio is never the target a thumb aims at — the label is,
        // and clicking it toggles the control. Measuring the 13×13px input would
        // report a defect that is not there and hide the one that is: a label too
        // short to hit.
        const measured = tapTargetFor(el);
        const rect = measured.getBoundingClientRect();
        if (rect.width < MIN_TAP_PX || rect.height < MIN_TAP_PX) {
          found.push({
            // Report the element that was measured, not the one that matched the
            // selector: for a labelled checkbox those differ, and naming the input
            // would send a reader looking at the wrong node.
            tag: measured.tagName.toLowerCase(),
            text: (measured.textContent ?? '').trim().slice(0, 32),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      });

      setIssues(found);
      // Mark this frame as measured. The probe only runs after hydration and a
      // frame of layout, so on a page mounting hundreds of frames the badges
      // appear well after the server HTML does. Without a positive signal a
      // reader — or a test — cannot tell "no issues" from "not measured yet",
      // and e2e/tap-targets.public.spec.ts read zero issues off a page that had
      // 21 of them, then reported the suite green.
      frameRef.current.setAttribute(PROBED_ATTR, '1');
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
        {...{ [FRAME_ATTR]: '' }}
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
              {...{
                [TAP_ISSUE_ATTR]: JSON.stringify({
                  ...issue,
                  entry: entry ?? '(unnamed entry)',
                  variant: label ?? '(default)',
                } satisfies TapIssuePayload),
              }}
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
