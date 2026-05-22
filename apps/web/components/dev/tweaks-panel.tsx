'use client';

import { useEffect, useState } from 'react';

type Palette = 'crepusculo' | 'bosque' | 'reposo';

const PALETTE_LABELS: Record<Palette, string> = {
  crepusculo: 'Crepúsculo',
  bosque: 'Bosque',
  reposo: 'Reposo',
};

const PALETTES: Palette[] = ['crepusculo', 'bosque', 'reposo'];

const LS_PALETTE_KEY = 'dh-dev-palette';
const LS_GRAIN_KEY = 'dh-dev-grain';

/**
 * TweaksPanel — dev-only palette + grain switcher.
 * Fixed bottom-right. Persists to localStorage.
 *
 * The parent (layout.tsx) gates rendering with:
 *   {process.env.NODE_ENV !== 'production' && <TweaksPanel />}
 * so this component does NOT check NODE_ENV itself.
 */
export function TweaksPanel() {
  const [palette, setPalette] = useState<Palette>('crepusculo');
  const [grain, setGrain] = useState(false);

  // Rehydrate from localStorage on mount
  useEffect(() => {
    const savedPalette = localStorage.getItem(LS_PALETTE_KEY) as Palette | null;
    const savedGrain = localStorage.getItem(LS_GRAIN_KEY);
    if (savedPalette && PALETTES.includes(savedPalette)) {
      setPalette(savedPalette);
      document.documentElement.setAttribute('data-palette', savedPalette);
    }
    if (savedGrain !== null) {
      const grainOn = savedGrain === 'true';
      setGrain(grainOn);
      document.documentElement.setAttribute('data-grain', grainOn ? 'on' : 'off');
    }
  }, []);

  function handlePaletteChange(p: Palette) {
    setPalette(p);
    document.documentElement.setAttribute('data-palette', p);
    localStorage.setItem(LS_PALETTE_KEY, p);
  }

  function handleGrainToggle() {
    const next = !grain;
    setGrain(next);
    document.documentElement.setAttribute('data-grain', next ? 'on' : 'off');
    localStorage.setItem(LS_GRAIN_KEY, String(next));
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        background: 'rgba(250,249,247,0.88)',
        backdropFilter: 'blur(20px) saturate(160%)',
        border: '0.5px solid rgba(255,255,255,0.6)',
        borderRadius: 12,
        boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontSize: 11,
        color: '#29261b',
        minWidth: 160,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.5, marginBottom: 2 }}>
        Tweaks
      </div>

      {/* Palette selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontWeight: 500, opacity: 0.65 }}>Paleta</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {PALETTES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handlePaletteChange(p)}
              style={{
                flex: 1,
                fontSize: 10,
                fontWeight: 600,
                padding: '4px 2px',
                borderRadius: 6,
                border: palette === p ? '1px solid rgba(0,0,0,0.4)' : '1px solid transparent',
                background: palette === p ? 'rgba(0,0,0,0.08)' : 'transparent',
                cursor: 'default',
                color: 'inherit',
              }}
            >
              {PALETTE_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Grain toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 500, opacity: 0.65 }}>Grano</span>
        <button
          type="button"
          role="switch"
          aria-checked={grain}
          onClick={handleGrainToggle}
          style={{
            width: 32,
            height: 18,
            borderRadius: 999,
            border: 0,
            background: grain ? '#34c759' : 'rgba(0,0,0,0.15)',
            cursor: 'default',
            padding: 0,
            position: 'relative',
            transition: 'background 0.15s',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: grain ? 14 : 2,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
              transition: 'left 0.15s',
            }}
          />
        </button>
      </div>
    </div>
  );
}
