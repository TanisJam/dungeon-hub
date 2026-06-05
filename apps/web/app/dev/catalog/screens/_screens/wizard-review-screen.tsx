import { ScreenFrame, ScreenSection } from '../_screen-frame';

// wizard/ organisms (presentational)
import { ReviewBanner } from '@/components/wizard/review-banner';
import { NumberedReviewCard } from '@/components/wizard/numbered-review-card';
import { SectionHead } from '@/components/ui/section-head';
import { AbilityScoreGrid } from '@/components/sheet/ability-score-grid';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import type { AbilityScoreEntry } from '@/components/sheet/ability-score-grid';

// wizard/ interactive islands (catalog)
import { CharacterNameInputIsland } from '../../components/_islands/character-name-input-island';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const _scores: Record<string, AbilityScoreEntry> = {
  str: { score: 16, modifier: 3 },
  dex: { score: 14, modifier: 2 },
  con: { score: 15, modifier: 2 },
  int: { score: 10, modifier: 0 },
  wis: { score: 8,  modifier: -1 },
  cha: { score: 18, modifier: 4 },
};

// ── Static Stepper stand-in ───────────────────────────────────────────────────
//
// The real <Stepper> is a 'use client' component that requires a characterId
// and reads the wizard state to determine the active step. In the catalog we
// render a faithful static stand-in (same visual idiom used in the stepperEntry
// in _registry.tsx) to avoid any client-routing dependency.

function StaticStepper({ activeIndex = 6 }: { activeIndex?: number }) {
  const labels = ['Atributos', 'Linaje', 'Clase', 'Trasfondo', 'Equipo', 'Hechizos', 'Revisión'];
  return (
    <div className="overflow-x-auto">
      <ol className="flex items-center gap-1.5 min-w-max py-1">
        {labels.map((label, i) => {
          const isActive = i === activeIndex;
          const isDone = i < activeIndex;
          return (
            <li key={label} className="flex items-center gap-1.5 shrink-0">
              <span
                className={[
                  'inline-flex items-center h-7',
                  isActive
                    ? 'gap-2 rounded-pill bg-ink pl-1 pr-3 py-1 text-paper text-xs font-semibold'
                    : `w-7 justify-center rounded-pill text-xs font-semibold ${isDone ? 'bg-primary-soft text-primary-deep' : 'bg-surface text-ink-mute border border-line'}`,
                ].join(' ')}
              >
                {i + 1}
                {isActive && <span className="text-xs font-semibold">{label}</span>}
              </span>
              {i < labels.length - 1 && (
                <span className="text-line text-xs select-none">›</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WizardReviewScreen() {
  return (
    <ScreenSection
      name="Wizard — Review"
      route="/characters/[id]/wizard/review"
      notes="Stepper is a static stand-in (real Stepper requires characterId + client routing). CharacterNameInputIsland is the real island (debounced autosave stub). All other organisms are presentational. showTabBar=false (wizard flow)."
    >
      <div className="space-y-1">
        <div className="font-mono text-[10px] text-ink-mute">Step 6 / 6 — Revisión</div>
        <ScreenFrame
          title="Constructor"
          subtitle="PASO 6 DE 6"
          lead="back"
          showTabBar={false}
        >
          <div className="space-y-4">
            {/* Character name + status header */}
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-bold text-ink">Brann Cuervosombrío</p>
              <Pill tone="accent" fill="soft" size="sm">Borrador</Pill>
            </div>

            {/* Static stepper (step 6 = Revisión active) */}
            <StaticStepper activeIndex={6} />

            {/* SectionHead */}
            <SectionHead size="md" num="06" title="Revisión" meta="Paso 6 de 6" />

            {/* ReviewBanner — dark gradient hero */}
            <ReviewBanner
              name="Brann Cuervosombrío"
              aventureroOf="Aventurero de Los Reinos Olvidados"
              raceClassSummary="Semielfo · Bardo 4"
              levelPill={{ label: 'Nivel 4' }}
              classPill={{ label: 'Bardo', tone: 'secondary' }}
              subclassPill={{ label: 'Colegio del Conocimiento', tone: 'accent' }}
            />

            {/* Ability scores in a surface card */}
            <Card variant="surface" className="p-3">
              <AbilityScoreGrid scores={_scores} />
            </Card>

            {/* NumberedReviewCards — Race / Class / Background / Equipment */}
            <NumberedReviewCard
              num="1"
              title="Semielfo"
              subtitle="Visión en la oscuridad · Resistencia feérica"
              pills={[{ label: 'Percepción' }, { label: 'Historia' }]}
              editHref="#"
            />
            <NumberedReviewCard
              num="2"
              title="Bardo"
              subtitle="Colegio del Conocimiento"
              pills={[{ label: 'Persuasión' }, { label: 'Engaño' }]}
              editHref="#"
            />
            <NumberedReviewCard
              num="3"
              title="Héroe del Pueblo"
              subtitle="Trasfondo — habilidades y equipo rural"
              pills={[{ label: 'Manejo de animales' }, { label: 'Supervivencia' }]}
              editHref="#"
            />
            <NumberedReviewCard
              num="4"
              title="Equipo inicial"
              subtitle="Espada larga · Armadura de cuero · Mochila de explorador"
              editHref="#"
            />

            {/* CharacterNameInput — interactive autosave island */}
            <CharacterNameInputIsland initialName="Brann Cuervosombrío" />

            {/* Activate footer card */}
            <Card variant="surface" className="p-4 space-y-2">
              <p className="text-xs text-ink-mute text-center">
                Al activar, tu personaje se enviará al DM para aprobación.
              </p>
              <Button tone="green" size="lg" fullWidth>
                Activar personaje
              </Button>
            </Card>
          </div>
        </ScreenFrame>
      </div>
    </ScreenSection>
  );
}
