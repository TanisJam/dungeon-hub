/**
 * Tokens view — Server Component.
 * Renders a visual inventory of all design tokens defined in globals.css @theme:
 * - Colors (swatch + semantic name + hex value + WCAG AA contrast vs paper/ink)
 * - Typography (font families + @utility type-scale)
 * - Radii
 * - Shadows
 * - Motion
 *
 * Token data is sourced from apps/web/lib/design-tokens.ts — edit there, not here.
 */

import {
  COLORS,
  FONT_FAMILIES,
  TYPE_SCALE,
  RADII,
  SHADOWS,
  MOTION,
  type ColorToken,
} from '@/lib/design-tokens';

// ── WCAG AA contrast helper (relative luminance) ──
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const linearize = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// AA normal text: 4.5:1  AA large text: 3:1
function aaPass(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= 4.5;
}

// Paper (dark bg) and Ink (light text) — from globals.css
const PAPER = '#0B0A12';
const INK   = '#F4EAD5';

// ── Sub-components ──

function SectionHead({ title }: { title: string }) {
  return (
    <h2 className="font-display font-bold text-base text-ink mt-8 mb-3 border-b border-line pb-2">
      {title}
    </h2>
  );
}

function ColorRow({ token }: { token: ColorToken }) {
  // rgba / non-hex tokens: skip WCAG contrast (not computable from rgba string alone)
  if (token.displayOnly) {
    return (
      <div className="flex items-center gap-3 py-2 border-b border-line-soft">
        {/* Swatch — inline rgba value */}
        <div
          className="w-10 h-10 rounded-md flex-shrink-0 border border-line"
          style={{ backgroundColor: token.hex }}
        />
        {/* Name + value */}
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-ink font-semibold">{token.name}</div>
          <div className="font-mono text-[10px] text-ink-mute">{token.hex}</div>
          {token.note && (
            <div className="text-[9px] text-warning-deep mt-0.5">{token.note}</div>
          )}
        </div>
        {/* No WCAG badges for rgba — value is context-dependent */}
        <div className="flex gap-1 flex-shrink-0">
          <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-surface text-ink-mute">
            N/A
          </span>
        </div>
      </div>
    );
  }

  const passOnPaper = aaPass(token.hex, PAPER);
  const passOnInk   = aaPass(token.hex, INK);

  return (
    <div className="flex items-center gap-3 py-2 border-b border-line-soft">
      {/* Swatch */}
      <div
        className="w-10 h-10 rounded-md flex-shrink-0 border border-line"
        style={{ backgroundColor: token.hex }}
      />
      {/* Name + value */}
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs text-ink font-semibold">{token.name}</div>
        <div className="font-mono text-[10px] text-ink-mute">{token.hex}</div>
        {token.note && (
          <div className="text-[9px] text-warning-deep mt-0.5">{token.note}</div>
        )}
      </div>
      {/* AA contrast badges */}
      <div className="flex gap-1 flex-shrink-0">
        <span
          className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${
            passOnPaper ? 'bg-primary-soft text-primary-deep' : 'bg-danger/20 text-danger'
          }`}
          title={`Contrast vs paper: ${contrastRatio(token.hex, PAPER).toFixed(1)}:1`}
        >
          paper {passOnPaper ? '✓' : '✗'}
        </span>
        <span
          className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${
            passOnInk ? 'bg-primary-soft text-primary-deep' : 'bg-danger/20 text-danger'
          }`}
          title={`Contrast vs ink: ${contrastRatio(token.hex, INK).toFixed(1)}:1`}
        >
          ink {passOnInk ? '✓' : '✗'}
        </span>
      </div>
    </div>
  );
}

export default function TokensPage() {
  return (
    <div className="space-y-2 pb-12">
      <h1 className="font-display font-bold text-xl text-ink">Design Tokens</h1>
      <p className="text-xs text-ink-mute">
        All tokens from <code className="font-mono text-ink-soft">globals.css @theme</code>.
        AA contrast checked against <code className="font-mono text-ink-soft">paper</code> (#0B0A12)
        and <code className="font-mono text-ink-soft">ink</code> (#F4EAD5) at 4.5:1 threshold.
        rgba tokens show N/A (context-dependent opacity).
      </p>

      {/* ── Colors ── */}
      <SectionHead title="Colors" />
      <div>
        {COLORS.map((token) => (
          <ColorRow key={token.name} token={token} />
        ))}
      </div>

      {/* ── Typography ── */}
      <SectionHead title="Typography — Font Families" />
      <div className="space-y-2">
        {FONT_FAMILIES.map(({ name, stack, cls }) => (
          <div key={name} className="py-3 border-b border-line-soft">
            <div className="font-mono text-xs text-ink font-semibold">{name}</div>
            <div className="font-mono text-[10px] text-ink-mute mt-0.5">{stack}</div>
            {/* Live sample rendered in the actual family */}
            <p className={`${cls} text-ink text-xl mt-2`}>
              El veloz murciélago hindú · Aa Gg 0123
            </p>
          </div>
        ))}
      </div>

      <SectionHead title="Typography — @utility Scale" />
      <div className="space-y-3">
        {TYPE_SCALE.map(({ name, size, utility }) => (
          <div key={name} className="py-2 border-b border-line-soft">
            <div className="flex items-baseline gap-3 mb-1">
              <code className="font-mono text-[10px] text-accent font-semibold">{name}</code>
              <span className="font-mono text-[10px] text-ink-mute">{size}</span>
              <span className="text-[9px] text-ink-mute">{utility}</span>
            </div>
            {/* Live sample with the actual utility class applied */}
            <p className={`${name} text-ink`}>El veloz murciélago — Aa 123</p>
          </div>
        ))}
        <p className="text-[10px] text-ink-mute italic mt-2">
          Live samples render with the actual <code className="font-mono text-ink-soft">@utility</code> class applied.
          Migration of existing <code className="font-mono text-ink-soft">text-[Npx]</code> arbitraries to these names is a follow-up.
        </p>
      </div>

      {/* ── Radii ── */}
      <SectionHead title="Border Radius" />
      <div className="space-y-2">
        {RADII.map(({ name, value, utilityClass }) => (
          <div key={name} className="flex items-center gap-4 py-2 border-b border-line-soft">
            <div
              className="w-10 h-10 bg-surface-soft border border-line flex-shrink-0"
              style={{ borderRadius: value }}
            />
            <div>
              <div className="font-mono text-xs text-ink font-semibold">{name}</div>
              <div className="font-mono text-[10px] text-ink-mute">
                {value} · <span className="text-accent">{utilityClass}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Shadows ── */}
      <SectionHead title="Shadows" />
      <div className="space-y-3">
        {SHADOWS.map(({ name, value }) => (
          <div key={name} className="py-3 border-b border-line-soft">
            <div className="font-mono text-xs text-ink font-semibold mb-2">{name}</div>
            <div
              className="w-full h-10 rounded-md bg-surface"
              style={{ boxShadow: value }}
            />
            <div className="font-mono text-[9px] text-ink-mute mt-1 break-all">{value}</div>
          </div>
        ))}
      </div>

      {/* ── Motion ── */}
      <SectionHead title="Motion" />
      <div className="space-y-3">
        {MOTION.map(({ name, type, value }) => {
          // Durations: sweep at the token's own duration (linear) → shows speed.
          // Easings: sweep at a fixed 1.2s with the token's curve → shows shape.
          const anim =
            type === 'duration'
              ? `wizard-loading ${value} linear infinite`
              : `wizard-loading 1.2s ${value} infinite`;
          return (
            <div key={name} className="py-2 border-b border-line-soft">
              <div className="flex items-center gap-3 mb-1.5">
                <span
                  className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
                    type === 'duration'
                      ? 'bg-primary-soft text-primary-deep'
                      : 'bg-secondary-soft text-secondary-deep'
                  }`}
                >
                  {type}
                </span>
                <code className="font-mono text-xs text-ink font-semibold">{name}</code>
                <span className="font-mono text-xs text-accent">{value}</span>
              </div>
              {/* Live demo: a bar sweeping across the track */}
              <div className="relative h-2 w-full overflow-hidden rounded-pill bg-surface-soft">
                <div
                  className="absolute inset-y-0 w-1/4 rounded-pill bg-gradient-to-r from-primary to-accent"
                  style={{ animation: anim }}
                />
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-ink-mute italic mt-2">
          Durations sweep at their own speed; easings sweep at a fixed 1.2s so the curve is visible.
        </p>
      </div>
    </div>
  );
}
