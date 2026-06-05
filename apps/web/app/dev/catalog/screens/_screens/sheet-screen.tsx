import { ScreenFrame, ScreenSection } from '../_screen-frame';

// sheet/ organisms (presentational)
import { Banner } from '@/components/sheet/banner';
import { SheetHero } from '@/components/sheet/sheet-hero';
import { VitalGrid } from '@/components/sheet/vital-grid';
import { AbilityScoreGrid } from '@/components/sheet/ability-score-grid';
import { SheetTabs } from '@/components/sheet/sheet-tabs';
import type { AbilityScoreEntry } from '@/components/sheet/ability-score-grid';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const _scores: Record<string, AbilityScoreEntry> = {
  str: { score: 16, modifier: 3 },
  dex: { score: 14, modifier: 2 },
  con: { score: 15, modifier: 2 },
  int: { score: 10, modifier: 0 },
  wis: { score: 8,  modifier: -1 },
  cha: { score: 18, modifier: 4 },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function SheetScreen() {
  return (
    <ScreenSection
      name="Character Sheet"
      route="/characters/[id]"
      notes="Representative composition only — full tab bodies live under Components. SheetTabs uses next/link (server-safe). Tabs link to demo-char-id which resolves nowhere in catalog; tabs are visual-only here."
    >
      <div className="space-y-1">
        <div className="font-mono text-[10px] text-ink-mute">Resumen tab (representative)</div>
        <ScreenFrame
          title="Brann Cuervosombrío"
          subtitle="SEMIELFO · BARDO 4"
          role="player"
          lead="back"
          activeTab="Inicio"
        >
          <div className="space-y-4">
            <Banner tone="amber">
              Personaje pendiente de aprobación del DM.
            </Banner>
            <SheetHero
              name="Brann Cuervosombrío"
              raceLabel="Semielfo"
              classLabel="Bardo"
              subclassLabel="Colegio del Conocimiento"
              level={4}
              xpCurrent={4200}
              xpNextThreshold={6500}
            />
            <VitalGrid
              hp={{ current: 28, max: 36 }}
              ac={14}
              initiative={2}
              armorFormula="Cuero (12 + DES)"
              walkSpeed={30}
            />
            <AbilityScoreGrid scores={_scores} />
            {/* SheetTabs — server-safe via next/link; links target a fixture characterId */}
            <SheetTabs activeTab="resumen" characterId="demo-char-id" />
            {/* Representative resumen content block */}
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Trasfondo</p>
              <p className="text-sm text-ink">Héroe del Pueblo</p>
              <p className="text-xs text-ink-mute">Habilidades: Manejo de animales · Supervivencia</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft pt-2">Linaje</p>
              <p className="text-sm text-ink">Semielfo — Visión en la oscuridad · Resistencia feérica</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft pt-2">Clase</p>
              <p className="text-sm text-ink">Bardo 4 — Colegio del Conocimiento</p>
              <p className="text-xs text-ink-mute">Inspiración bárdica (d6) · 4 usos</p>
            </div>
          </div>
        </ScreenFrame>
      </div>
    </ScreenSection>
  );
}
