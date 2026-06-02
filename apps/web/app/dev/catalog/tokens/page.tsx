/**
 * Tokens view — Server Component.
 * Renders a visual inventory of all design tokens defined in globals.css @theme:
 * - Colors (swatch + semantic name + hex value + WCAG AA contrast vs paper/ink)
 * - Typography (font families + @utility type-scale)
 * - Radii
 * - Shadows
 * - Motion
 */

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

// ── Token data (mirrors globals.css @theme) ──
type ColorToken = { name: string; hex: string; note?: string };

const COLORS: ColorToken[] = [
  { name: 'paper',              hex: '#0B0A12' },
  { name: 'paper-soft',         hex: '#13111C' },
  { name: 'surface',            hex: '#1A1726' },
  { name: 'surface-soft',       hex: '#221E30' },
  { name: 'ink',                hex: '#F4EAD5' },
  { name: 'ink-soft',           hex: '#C9BFA8' },
  { name: 'ink-mute',           hex: '#8B8273' },
  { name: 'line',               hex: '#3A3145' },
  { name: 'line-soft',          hex: '#26212F' },
  { name: 'primary',            hex: '#5BB3C9', note: 'arcane cyan' },
  { name: 'primary-deep',       hex: '#3A8FA8' },
  { name: 'primary-soft',       hex: '#1A2F38' },
  { name: 'accent',             hex: '#D4A24C', note: 'copper' },
  { name: 'accent-deep',        hex: '#A87528' },
  { name: 'accent-soft',        hex: '#3A2D17' },
  { name: 'secondary',          hex: '#A85A8E', note: 'magenta' },
  { name: 'secondary-deep',     hex: '#7F3F6B' },
  { name: 'secondary-soft',     hex: '#2E1A28' },
  { name: 'success',            hex: '#6BA368' },
  { name: 'warning',            hex: '#E0A82E', note: 'hotter amber — distinct from copper accent' },
  { name: 'warning-soft',       hex: '#3A2D17' },
  { name: 'warning-deep',       hex: '#B07A1E' },
  { name: 'danger',             hex: '#CC4444' },
  { name: 'on-accent',          hex: '#1A1208', note: 'dark text on accent/copper backgrounds' },
  { name: 'on-secondary',       hex: '#1A1208', note: 'dark text on secondary/magenta backgrounds' },
];

type TypographyToken = { name: string; stack: string };
const FONT_FAMILIES: TypographyToken[] = [
  { name: 'display (font-display)', stack: 'Noto Serif Georgian, Georgia, serif' },
  { name: 'sans (font-sans)',       stack: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  { name: 'script (font-script)',   stack: 'M PLUS Rounded, system-ui, sans-serif' },
  { name: 'mono (font-mono)',       stack: 'JetBrains Mono, ui-monospace, SF Mono, Menlo, monospace' },
];

type ScaleEntry = { name: string; size: string; utility: string };
const TYPE_SCALE: ScaleEntry[] = [
  { name: 'text-micro',    size: '9px',  utility: 'lh 1.4' },
  { name: 'text-caption',  size: '11px', utility: 'lh 1.4' },
  { name: 'text-eyebrow',  size: '10px', utility: 'sans, 700, uppercase, tracking-wide' },
  { name: 'text-footnote', size: '13px', utility: 'lh 1.45' },
  { name: 'text-body',     size: '15px', utility: 'lh 1.5' },
  { name: 'text-body-lg',  size: '17px', utility: 'lh 1.5' },
  { name: 'text-subhead',  size: '19px', utility: 'lh 1.4' },
  { name: 'text-title',    size: '22px', utility: 'lh 1.3' },
  { name: 'text-headline', size: '26px', utility: 'lh 1.25' },
  { name: 'text-stat',     size: '28px', utility: 'display, 700, tabular-nums' },
  { name: 'text-display',  size: '30px', utility: 'lh 1.2' },
];

type RadiusToken = { name: string; value: string; utilityClass: string };
const RADII: RadiusToken[] = [
  { name: 'radius-sm',   value: '8px',   utilityClass: 'rounded-sm' },
  { name: 'radius-md',   value: '12px',  utilityClass: 'rounded-md' },
  { name: 'radius-lg',   value: '18px',  utilityClass: 'rounded-lg' },
  { name: 'radius-pill', value: '999px', utilityClass: 'rounded-pill' },
];

type ShadowToken = { name: string; value: string };
const SHADOWS: ShadowToken[] = [
  { name: 'shadow-stamp-sm', value: '0 1px 2px rgba(0,0,0,0.4)' },
  { name: 'shadow-stamp-md', value: '0 6px 16px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)' },
  { name: 'shadow-stamp-lg', value: '0 16px 40px rgba(0,0,0,0.6)' },
  { name: 'shadow-glow-primary',   value: '0 0 0 1px rgba(91,179,201,0.45), 0 0 24px rgba(91,179,201,0.28)' },
  { name: 'shadow-glow-accent',    value: '0 0 0 1px rgba(212,162,76,0.50), 0 0 16px rgba(212,162,76,0.22)' },
  { name: 'shadow-glow-secondary', value: '0 0 0 1px rgba(168,90,142,0.45), 0 0 16px rgba(168,90,142,0.20)' },
];

type MotionToken = { name: string; type: 'duration' | 'ease'; value: string };
const MOTION: MotionToken[] = [
  { name: '--dur-fast', type: 'duration', value: '120ms' },
  { name: '--dur-base', type: 'duration', value: '200ms' },
  { name: '--dur-slow', type: 'duration', value: '320ms' },
  { name: '--ease-out',    type: 'ease', value: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  { name: '--ease-in-out', type: 'ease', value: 'cubic-bezier(0.4, 0, 0.2, 1)' },
];

// ── Sub-components ──

function SectionHead({ title }: { title: string }) {
  return (
    <h2 className="font-display font-bold text-base text-ink mt-8 mb-3 border-b border-line pb-2">
      {title}
    </h2>
  );
}

function ColorRow({ token }: { token: ColorToken }) {
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
        {FONT_FAMILIES.map(({ name, stack }) => (
          <div key={name} className="py-2 border-b border-line-soft">
            <div className="font-mono text-xs text-ink font-semibold">{name}</div>
            <div className="font-mono text-[10px] text-ink-mute mt-0.5">{stack}</div>
          </div>
        ))}
      </div>

      <SectionHead title="Typography — @utility Scale" />
      <div className="space-y-2">
        {TYPE_SCALE.map(({ name, size, utility }) => (
          <div key={name} className="py-2 border-b border-line-soft flex items-baseline gap-4">
            <code className="font-mono text-xs text-ink font-semibold w-32 flex-shrink-0">{name}</code>
            <span className="font-mono text-[10px] text-accent">{size}</span>
            <span className="text-[10px] text-ink-mute">{utility}</span>
          </div>
        ))}
        <p className="text-[10px] text-ink-mute italic mt-2">
          All 9 named scale entries (text-micro → text-display) added in Slice 4. Migration of text-[Npx] arbitraries is a follow-up.
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
      <div className="space-y-2">
        {MOTION.map(({ name, type, value }) => (
          <div key={name} className="py-2 border-b border-line-soft">
            <div className="flex items-center gap-3">
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
          </div>
        ))}
        <p className="text-[10px] text-ink-mute italic mt-2">
          Note: <code className="font-mono text-ink-soft">--dur-*</code> tokens are CSS custom properties only.
          Dedicated <code className="font-mono text-ink-soft">@utility</code> helpers are a follow-up item.
        </p>
      </div>
    </div>
  );
}
