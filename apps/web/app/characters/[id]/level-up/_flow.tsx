'use client';

/**
 * LevelUpFlow — step-graph-driven stepper for play-time level-up.
 *
 * Steps: mode → class → hp → subclass (cond.) → asi-feat (cond.) → spells (cond.) → review
 *
 * Mobile-first: fullscreen at 375px, centered panel on md+.
 * REQ-CLU-PLAY-TIME-AUTH, REQ-CLU-BODY-DISCRIMINATOR, REQ-CLU-HP-DELTA-ATOMIC.
 * REQ-CLU-GRAPH-BUILD-ACTIVE-STEPS, REQ-CLU-GRAPH-PREV-FROM-REVIEW.
 * REQ-CLU-GRAPH-TOTAL-STEPS-DERIVED.
 *
 * SDD level-up-choices-completion (C4).
 */

import { useState, useTransition, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  submitLevelUp,
  retrySaveSpells,
  getSpellOptions,
  type LevelUpBody,
  type LevelUpSummary,
  type AppliedClassSpellsForAction,
} from './actions';
import {
  buildActiveSteps,
  nextStep,
  prevStep,
  totalActiveSteps,
  currentStepIndex,
  type FlowState,
  type StepId,
  type Mode,
  type HpMethod,
  type AsiFeatKind,
  type FlowCtx,
  type ClassRef,
} from './_step-graph';
import { SubclassStep } from './_subclass-step';
import { SpellsStep } from './_spells-step';
import type { SubclassRow } from '@/app/characters/[id]/wizard/class/_picker';
import type {
  SpellLimitsView,
  AvailableSpell,
  AppliedClassSpells,
} from '@/app/characters/[id]/wizard/spells/_picker';

// ---- Types ------------------------------------------------------------------

interface OwnedClass {
  slug: string;
  source: string;
  level: number;
  hitDie: string;
  isAsiLevel: boolean; // true if (level + 1) is an ASI level for this class
}

interface LevelUpFlowProps {
  characterId: string;
  ownedClasses: OwnedClass[];
  multiclassingEnabled: boolean;
  characterName: string;
  flowCtx: FlowCtx;
  subclassesByClass: Record<string, SubclassRow[]>;
  /** Spell limits at toLevel per caster class. Computed server-side in page.tsx. */
  spellLimitsByClass: Record<string, SpellLimitsView>;
  /** Existing spell picks per class (for pre-seeding the spells step). */
  existingSpellsByClass: Record<string, AppliedClassSpells>;
}

const INITIAL_STATE: FlowState = {
  step: 'mode',
  mode: null,
  selectedClass: null,
  hpMethod: 'average',
  asiFeat: null,
  asiDeltas: {},
  subclass: null,
  spellPicks: null,
};

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABILITY_LABELS: Record<string, string> = {
  str: 'FUE', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR',
};

export function LevelUpFlow({
  characterId,
  ownedClasses,
  multiclassingEnabled,
  characterName,
  flowCtx,
  subclassesByClass,
  spellLimitsByClass,
  existingSpellsByClass,
}: LevelUpFlowProps) {
  const router = useRouter();
  const [state, setState] = useState<FlowState>(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<LevelUpSummary | null>(null);
  const [partialSpellsError, setPartialSpellsError] = useState<{ code: string; message: string } | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Spell options (availableSpells) — fetched client-side when spells step is active.
  const [availableSpells, setAvailableSpells] = useState<AvailableSpell[] | null>(null);
  const [spellSubclassGrants, setSpellSubclassGrants] = useState<string[]>([]);

  function update(partial: Partial<FlowState>) {
    setState((s) => ({ ...s, ...partial }));
    setError(null);
  }

  // Fetch spell options when the spells step becomes active.
  // Clears previous results when class changes (different slug → different pool).
  useEffect(() => {
    if (state.step !== 'spells' || !state.selectedClass) return;
    const { slug } = state.selectedClass;

    let cancelled = false;
    setAvailableSpells(null); // reset to loading state

    getSpellOptions(characterId, slug).then((result) => {
      if (cancelled) return;
      setAvailableSpells(result?.availableSpells ?? []);
      setSpellSubclassGrants(result?.subclassGrantedSlugs ?? []);
    });

    return () => { cancelled = true; };
  }, [state.step, state.selectedClass?.slug, characterId]);

  // ---- Navigation helpers ---------------------------------------------------

  function goToStep(step: StepId) {
    update({ step });
  }

  function handleBack() {
    const prev = prevStep(state, flowCtx);
    if (prev) goToStep(prev);
  }

  // ---- Step transitions -----------------------------------------------------

  function handleModeSelect(mode: Mode) {
    // Build tentative state to compute next step
    const tentative: FlowState = {
      ...INITIAL_STATE,
      mode,
      step: 'mode',
    };
    const next = nextStep(tentative, flowCtx) ?? 'class';
    update({ mode, selectedClass: null, subclass: null, spellPicks: null, asiFeat: null, asiDeltas: {}, step: next });
  }

  function handleClassSelect(cls: ClassRef) {
    // Build tentative state to compute next step from 'class'
    const tentative: FlowState = {
      ...state,
      selectedClass: cls,
      step: 'class',
      subclass: null,
      spellPicks: null,
      asiFeat: null,
      asiDeltas: {},
    };
    const next = nextStep(tentative, flowCtx) ?? 'hp';
    setState((s) => ({
      ...s,
      selectedClass: cls,
      step: next,
      subclass: null,
      spellPicks: null,
      asiFeat: null,
      asiDeltas: {},
    }));
    setError(null);
  }

  function handleHpContinue(method: HpMethod) {
    const tentative: FlowState = { ...state, hpMethod: method, step: 'hp' };
    const next = nextStep(tentative, flowCtx) ?? 'review';
    update({ hpMethod: method, step: next });
  }

  function handleSubclassContinue(sub: ClassRef) {
    const tentative: FlowState = { ...state, subclass: sub, step: 'subclass' };
    const next = nextStep(tentative, flowCtx) ?? 'review';
    update({ subclass: sub, step: next });
  }

  function handleAsiFeatContinue(kind: AsiFeatKind, deltas: Partial<Record<string, number>>) {
    const tentative: FlowState = { ...state, asiFeat: kind, asiDeltas: deltas, step: 'asi-feat' };
    const next = nextStep(tentative, flowCtx) ?? 'review';
    update({ asiFeat: kind, asiDeltas: deltas, step: next });
  }

  function handleSpellsContinue(picks: AppliedClassSpells) {
    // Store as AppliedClassSpellsLite (compatible shape for FlowState)
    const spellPicks = {
      cantrips: picks.cantrips,
      known: picks.known,
      prepared: picks.prepared,
    };
    const tentative: FlowState = { ...state, spellPicks, step: 'spells' };
    const next = nextStep(tentative, flowCtx) ?? 'review';
    update({ spellPicks, step: next });
  }

  // ---- Submit ---------------------------------------------------------------

  function handleSubmit() {
    const { mode, selectedClass, hpMethod, asiFeat, asiDeltas, subclass, spellPicks } = state;
    if (!selectedClass || !mode) return;

    const body: LevelUpBody =
      mode === 'same-class'
        ? {
            kind: 'same-class',
            class: selectedClass,
            hp: { method: hpMethod },
            ...(asiFeat === 'asi'
              ? { asiFeat: { kind: 'asi', deltas: asiDeltas } }
              : {}),
            ...(subclass ? { subclass } : {}),
            ...(spellPicks ? { spellPicks: spellPicks as AppliedClassSpellsForAction } : {}),
          }
        : {
            kind: 'new-class',
            class: selectedClass,
            hp: { method: hpMethod },
          };

    startTransition(async () => {
      const result = await submitLevelUp(characterId, body);
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      if (result.ok === 'partial') {
        setSummary(result.summary);
        setPartialSpellsError(result.spellsError);
        return;
      }
      setSummary(result.summary);
    });
  }

  async function handleRetrySpells() {
    if (!state.selectedClass || !state.spellPicks) return;
    setIsRetrying(true);
    const result = await retrySaveSpells(
      characterId,
      state.selectedClass.slug,
      state.spellPicks as AppliedClassSpellsForAction,
    );
    setIsRetrying(false);
    if (result.ok) {
      setPartialSpellsError(null);
    } else {
      setPartialSpellsError({ code: result.error, message: 'Error al reintentar guardar hechizos.' });
    }
  }

  // ---- Summary screen (after success) --------------------------------------

  if (summary) {
    return (
      <SuccessScreen
        summary={summary}
        partialSpellsError={partialSpellsError}
        isRetrying={isRetrying}
        onRetrySpells={handleRetrySpells}
        onDone={() => router.push(`/characters/${characterId}`)}
      />
    );
  }

  // ---- Stepper shell -------------------------------------------------------

  const total = totalActiveSteps(state, flowCtx);
  const current = currentStepIndex(state, flowCtx);
  const hasPrev = prevStep(state, flowCtx) !== null;

  // Subclass title lookup (localized) — used in the subclass step header
  const SUBCLASS_TITLES: Record<string, string> = {
    barbarian: 'Camino primigenio', bard: 'Colegio de bardo', cleric: 'Dominio divino',
    druid: 'Círculo druídico', fighter: 'Arquetipo marcial', monk: 'Tradición monástica',
    paladin: 'Juramento sagrado', ranger: 'Arquetipo de guardabosques', rogue: 'Arquetipo pícaro',
    sorcerer: 'Origen de hechicero', warlock: 'Patrón sobrenatural', wizard: 'Tradición arcana',
  };
  const subclassTitle = SUBCLASS_TITLES[state.selectedClass?.slug ?? ''] ?? 'Subclase';
  const subclassRows = state.selectedClass
    ? (subclassesByClass[state.selectedClass.slug] ?? null)
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-paper md:min-h-0 md:rounded-2xl md:shadow-xl">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        {hasPrev && (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Paso anterior"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-mute hover:text-ink hover:bg-paper-muted transition-colors"
          >
            ←
          </button>
        )}
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wide text-ink-mute">Subir de nivel</p>
          <p className="truncate text-sm font-bold text-ink">{characterName}</p>
        </div>
        <span className="shrink-0 text-xs text-ink-mute">
          {current}/{total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-paper-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {state.step === 'mode' && (
          <ModeStep
            multiclassingEnabled={multiclassingEnabled}
            onSelect={handleModeSelect}
          />
        )}

        {state.step === 'class' && (
          <ClassStep
            mode={state.mode!}
            ownedClasses={ownedClasses}
            onSelect={handleClassSelect}
          />
        )}

        {state.step === 'hp' && (
          <HpStep
            selectedClass={state.selectedClass!}
            onContinue={handleHpContinue}
          />
        )}

        {state.step === 'subclass' && state.selectedClass && (
          <SubclassStep
            selectedClass={state.selectedClass}
            subclassTitle={subclassTitle}
            rows={subclassRows}
            onContinue={handleSubclassContinue}
          />
        )}

        {state.step === 'asi-feat' && (
          <AsiFeatStep
            onContinue={handleAsiFeatContinue}
          />
        )}

        {state.step === 'spells' && state.selectedClass && (
          <SpellsStep
            classSlug={state.selectedClass.slug}
            classSource={state.selectedClass.source}
            limits={spellLimitsByClass[state.selectedClass.slug] ?? {
              cantripsKnown: 0,
              spellsKnown: null,
              spellsPrepared: null,
              maxSpellLevel: 0,
              ability: null,
            }}
            availableSpells={availableSpells}
            subclassGrantedSlugs={spellSubclassGrants}
            initialValue={existingSpellsByClass[state.selectedClass.slug] ?? {
              cantrips: [],
              known: [],
              prepared: [],
            }}
            onContinue={handleSpellsContinue}
          />
        )}

        {state.step === 'review' && (
          <ReviewStep
            state={state}
            isPending={isPending}
            onSubmit={handleSubmit}
            onBack={handleBack}
          />
        )}
      </div>
    </div>
  );
}

// ---- Step: Mode -------------------------------------------------------------

function ModeStep({
  multiclassingEnabled,
  onSelect,
}: {
  multiclassingEnabled: boolean;
  onSelect: (mode: Mode) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-ink">¿Qué tipo de nivel es?</h2>

      <button
        type="button"
        onClick={() => onSelect('same-class')}
        className="flex min-h-[56px] w-full items-start gap-3 rounded-xl border border-line bg-paper-soft px-4 py-4 text-left hover:border-primary hover:bg-primary-soft transition-colors"
      >
        <div>
          <p className="text-sm font-semibold text-ink">Subir clase existente</p>
          <p className="text-xs text-ink-mute">Agrega un nivel a una de tus clases actuales</p>
        </div>
      </button>

      {multiclassingEnabled && (
        <button
          type="button"
          onClick={() => onSelect('new-class')}
          className="flex min-h-[56px] w-full items-start gap-3 rounded-xl border border-line bg-paper-soft px-4 py-4 text-left hover:border-primary hover:bg-primary-soft transition-colors"
        >
          <div>
            <p className="text-sm font-semibold text-ink">Agregar nueva clase</p>
            <p className="text-xs text-ink-mute">Multiclase — requiere cumplir los prerequisitos</p>
          </div>
        </button>
      )}
    </div>
  );
}

// ---- Step: Class ------------------------------------------------------------

const CLASS_LABELS: Record<string, string> = {
  fighter: 'Guerrero', wizard: 'Mago', cleric: 'Clérigo', rogue: 'Pícaro',
  ranger: 'Guardabosques', paladin: 'Paladín', barbarian: 'Bárbaro', bard: 'Bardo',
  druid: 'Druida', monk: 'Monje', sorcerer: 'Hechicero', warlock: 'Brujo',
};

function ClassStep({
  mode,
  ownedClasses,
  onSelect,
}: {
  mode: Mode;
  ownedClasses: OwnedClass[];
  onSelect: (cls: ClassRef) => void;
}) {
  if (mode === 'same-class') {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-bold text-ink">¿Qué clase subís?</h2>
        <div className="space-y-2">
          {ownedClasses.map((cls) => (
            <button
              key={cls.slug}
              type="button"
              onClick={() => onSelect({ slug: cls.slug, source: cls.source })}
              className="flex min-h-[56px] w-full items-center justify-between rounded-xl border border-line bg-paper-soft px-4 py-3 text-left hover:border-primary hover:bg-primary-soft transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-ink capitalize">
                  {CLASS_LABELS[cls.slug] ?? cls.slug}
                </p>
                <p className="text-xs text-ink-mute">Nivel {cls.level} → {cls.level + 1}</p>
              </div>
              <span className="shrink-0 text-sm font-bold text-primary-deep">
                {cls.hitDie}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // new-class: show a simple text input for the class slug + source
  // (MVP: no typeahead for new classes; player types the slug)
  return <NewClassStep onSelect={onSelect} />;
}

function NewClassStep({ onSelect }: { onSelect: (cls: ClassRef) => void }) {
  const AVAILABLE_CLASSES = [
    'barbarian', 'bard', 'cleric', 'druid', 'fighter',
    'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-ink">¿Qué clase nueva tomás?</h2>
      <p className="text-xs text-ink-mute">Requiere cumplir los prerequisitos de multiclase (PHB p.163)</p>
      <div className="space-y-2">
        {AVAILABLE_CLASSES.map((cls) => (
          <button
            key={cls}
            type="button"
            onClick={() => onSelect({ slug: cls, source: 'PHB' })}
            className="flex min-h-[44px] w-full items-center rounded-xl border border-line bg-paper-soft px-4 py-3 text-left hover:border-primary hover:bg-primary-soft transition-colors"
          >
            <p className="text-sm font-semibold text-ink capitalize">
              {CLASS_LABELS[cls] ?? cls}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Step: HP ---------------------------------------------------------------

function HpStep({
  selectedClass,
  onContinue,
}: {
  selectedClass: ClassRef;
  onContinue: (method: HpMethod) => void;
}) {
  const [method, setMethod] = useState<HpMethod>('average');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-ink">¿Cómo calculás tu HP?</h2>
        <p className="text-xs text-ink-mute mt-1">PHB p.15 — promedio garantiza el valor fijo; tirar puede dar más o menos</p>
      </div>

      <div className="space-y-3">
        {(['average', 'roll'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
              method === m
                ? 'border-primary bg-primary-soft text-primary-deep'
                : 'border-line bg-paper-soft text-ink hover:border-primary hover:bg-primary-soft'
            }`}
          >
            <div
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                method === m ? 'border-primary' : 'border-ink-mute'
              }`}
            >
              {method === m && (
                <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold">
                {m === 'average' ? 'Promedio' : 'Tirar dado'}
              </p>
              <p className="text-xs text-ink-mute">
                {m === 'average'
                  ? 'HP garantizado, sin sorpresas'
                  : 'El servidor tira el dado — podés ganar más o menos'}
              </p>
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onContinue(method)}
        className="min-h-[44px] w-full rounded-xl border border-primary bg-primary px-4 py-3 text-sm font-semibold text-paper hover:bg-primary-deep transition-colors"
      >
        Continuar
      </button>
    </div>
  );
}

// ---- Step: ASI/Feat ---------------------------------------------------------

function AsiFeatStep({
  onContinue,
}: {
  onContinue: (kind: AsiFeatKind, deltas: Partial<Record<string, number>>) => void;
}) {
  const [kind, setKind] = useState<'asi' | 'feat'>('asi');
  const [deltas, setDeltas] = useState<Partial<Record<string, number>>>({});

  const deltaSum = Object.values(deltas).reduce<number>((s, v) => s + (v ?? 0), 0);
  const isValid = kind === 'feat' || deltaSum === 2;

  function setDelta(ability: string, value: number) {
    setDeltas((d) => {
      if (value === 0) {
        const next = { ...d };
        delete next[ability];
        return next;
      }
      return { ...d, [ability]: value };
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-ink">Mejora de características</h2>
        <p className="text-xs text-ink-mute mt-1">PHB p.163 — +2 a uno o +1+1 a dos atributos distintos</p>
      </div>

      {/* Tab toggle */}
      <div className="flex rounded-xl border border-line overflow-hidden">
        {(['asi', 'feat'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              kind === k
                ? 'bg-primary text-paper'
                : 'bg-paper text-ink-mute hover:bg-paper-muted hover:text-ink'
            }`}
          >
            {k === 'asi' ? 'Atributo (+2)' : 'Dote'}
          </button>
        ))}
      </div>

      {kind === 'asi' && (
        <div className="space-y-3">
          <p className="text-xs text-ink-mute">
            Suma distribuida: <strong className={deltaSum > 2 ? 'text-red-600' : 'text-ink'}>{deltaSum}/2</strong>
          </p>
          {ABILITY_KEYS.map((ability) => (
            <div key={ability} className="flex items-center gap-3">
              <span className="w-10 shrink-0 text-sm font-semibold text-ink-mute">
                {ABILITY_LABELS[ability]}
              </span>
              <div className="flex items-center gap-2">
                {[0, 1, 2].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setDelta(ability, val)}
                    className={`h-9 w-9 rounded-lg border text-sm font-semibold transition-colors ${
                      (deltas[ability] ?? 0) === val
                        ? 'border-primary bg-primary text-paper'
                        : 'border-line bg-paper text-ink hover:border-primary hover:bg-primary-soft'
                    }`}
                  >
                    +{val}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {kind === 'feat' && (
        <div className="rounded-xl border border-line bg-paper-soft p-4">
          <p className="text-sm text-ink-mute">
            La selección de dotes completa se implementará en una versión futura. Por ahora,
            elegí <strong>Atributo (+2)</strong> para continuar.
          </p>
        </div>
      )}

      <button
        type="button"
        disabled={!isValid}
        onClick={() => onContinue(kind, kind === 'asi' ? deltas : {})}
        className="min-h-[44px] w-full rounded-xl border border-primary bg-primary px-4 py-3 text-sm font-semibold text-paper hover:bg-primary-deep transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        Continuar
      </button>
    </div>
  );
}

// ---- Step: Review -----------------------------------------------------------

function ReviewStep({
  state,
  isPending,
  onSubmit,
  onBack,
}: {
  state: FlowState;
  isPending: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const { mode, selectedClass, hpMethod, asiFeat, asiDeltas, subclass } = state;
  const owned = mode === 'same-class';

  return (
    <div className="space-y-6">
      <h2 className="text-base font-bold text-ink">Confirmá tu subida de nivel</h2>

      <dl className="space-y-3">
        <Row label="Tipo" value={owned ? 'Subir clase existente' : 'Nueva clase (multiclase)'} />
        <Row
          label="Clase"
          value={
            `${CLASS_LABELS[selectedClass?.slug ?? ''] ?? selectedClass?.slug ?? '—'}`
          }
        />
        <Row
          label="HP"
          value={hpMethod === 'average' ? 'Promedio' : 'Tirar dado (el servidor tira)'}
        />
        {subclass && (
          <Row label="Subclase" value={subclass.slug} />
        )}
        {asiFeat === 'asi' && Object.keys(asiDeltas).length > 0 && (
          <Row
            label="ASI"
            value={Object.entries(asiDeltas)
              .filter(([, v]) => v && v > 0)
              .map(([k, v]) => `${ABILITY_LABELS[k] ?? k} +${v}`)
              .join(', ')}
          />
        )}
      </dl>

      <button
        type="button"
        disabled={isPending}
        onClick={onSubmit}
        className="min-h-[44px] w-full rounded-xl border border-primary bg-primary px-4 py-3 text-sm font-semibold text-paper hover:bg-primary-deep transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? 'Subiendo de nivel…' : 'Confirmar subida de nivel'}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{label}</dt>
      <dd className="text-sm font-medium text-ink text-right">{value}</dd>
    </div>
  );
}

// ---- Success screen ---------------------------------------------------------

function SuccessScreen({
  summary,
  partialSpellsError,
  isRetrying,
  onRetrySpells,
  onDone,
}: {
  summary: LevelUpSummary;
  partialSpellsError: { code: string; message: string } | null;
  isRetrying: boolean;
  onRetrySpells: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center md:min-h-0 md:py-12">
      <div className="text-5xl" aria-hidden>✦</div>
      <div>
        <h2 className="text-xl font-bold text-ink">¡Subiste de nivel!</h2>
        <p className="mt-1 text-sm text-ink-mute capitalize">
          {CLASS_LABELS[summary.classSlug] ?? summary.classSlug}{' '}
          {summary.fromClassLevel} → {summary.toClassLevel}
        </p>
      </div>

      {/* Partial spell save warning (REQ-CLU-SPL-TWO-PHASE-SUBMIT) */}
      {partialSpellsError && (
        <div className="w-full max-w-xs rounded-xl border border-warning-soft bg-warning-soft/30 p-4 text-left">
          <p className="text-xs text-warning-deep">
            Subiste de nivel, pero los hechizos no se guardaron. {partialSpellsError.code}.
            Tocá «Reintentar guardar hechizos» para reintentar.
          </p>
          <button
            type="button"
            onClick={onRetrySpells}
            disabled={isRetrying}
            className="mt-2 min-h-[44px] w-full rounded-lg border border-warning-deep bg-paper px-4 py-2 text-xs font-semibold text-warning-deep disabled:opacity-50"
          >
            {isRetrying ? 'Reintentando…' : 'Reintentar guardar hechizos'}
          </button>
        </div>
      )}

      <dl className="w-full max-w-xs space-y-2 rounded-xl border border-line bg-paper-soft p-4 text-left">
        <Row label="HP ganados" value={`+${summary.hpDelta}`} />
        {summary.rollUsed !== null && (
          <Row label="Tirada" value={`${summary.rollUsed}`} />
        )}
        <Row label="Nivel total" value={`${summary.totalLevelAfter}`} />
        {summary.asiFeatApplied && (
          <Row label="ASI/Dote" value={summary.asiFeatApplied === 'asi' ? 'Atributo' : 'Dote'} />
        )}
      </dl>

      {/* Features unlocked section (REQ-CLU-FTR-SUCCESS-SCREEN) */}
      {(summary.featuresUnlocked?.length ?? 0) > 0 && (
        <section className="w-full max-w-xs rounded-xl border border-line bg-paper-soft p-4 text-left">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">
            Características nuevas
          </p>
          <ul className="space-y-1.5 text-sm text-ink">
            {summary.featuresUnlocked!.map((f) => (
              <li key={f.name}>• {f.name}</li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={onDone}
        className="min-h-[44px] w-full max-w-xs rounded-xl border border-primary bg-primary px-4 py-3 text-sm font-semibold text-paper hover:bg-primary-deep transition-colors"
      >
        Ver ficha
      </button>
    </div>
  );
}
