'use client';

import { useState, useTransition } from 'react';
import { rollStartingGold } from '@dungeon-hub/domain/character/starting-equipment';
import type {
  ParsedClassEquipment,
  ParsedBackgroundEquipment,
  ParsedRef,
  ParsedChoiceRow,
} from '@dungeon-hub/domain/character/starting-equipment';
import type { EquipmentSelections, EquipmentType } from '@dungeon-hub/domain/character/starting-equipment';
import { saveEquipmentSelections, fetchCategoryItems, type CategoryItemRow } from './actions';
import { WizardFooterNav } from '@/components/wizard/wizard-footer-nav';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCategoryRef(ref: ParsedRef): ref is { equipmentType: EquipmentType; quantity: number } {
  return 'equipmentType' in ref;
}

function isSpecialRef(ref: ParsedRef): ref is { special: string; quantity?: number } {
  return 'special' in ref;
}

function isItemGrant(
  ref: ParsedRef,
): ref is { slug: string; source: string; quantity: number; displayName?: string } {
  return 'slug' in ref;
}

function refLabel(ref: ParsedRef): string {
  if (isItemGrant(ref)) {
    const base = ref.displayName ?? ref.slug;
    return ref.quantity > 1 ? `${base} ×${ref.quantity}` : base;
  }
  if (isCategoryRef(ref)) {
    return `(elige ${ref.quantity > 1 ? `${ref.quantity} ` : 'un '}${equipmentTypeLabel(ref.equipmentType)})`;
  }
  if (isSpecialRef(ref)) {
    const q = ref.quantity && ref.quantity > 1 ? ` ×${ref.quantity}` : '';
    return `${ref.special}${q}`;
  }
  return '';
}

function equipmentTypeLabel(type: string): string {
  const LABELS: Record<string, string> = {
    weaponMartial: 'arma marcial',
    weaponSimple: 'arma simple',
    weaponMartialMelee: 'arma marcial cuerpo a cuerpo',
    weaponSimpleMelee: 'arma simple cuerpo a cuerpo',
    focusSpellcastingArcane: 'foco arcano',
    focusSpellcastingHoly: 'símbolo sagrado',
    focusSpellcastingDruidic: 'foco druídico',
    instrumentMusical: 'instrumento musical',
  };
  return LABELS[type] ?? type;
}

// ─── Category picker inline ───────────────────────────────────────────────────

function CategoryPickerInline({
  worldId,
  categoryKey,
  equipmentType,
  selectedSlug,
  onSelect,
}: {
  worldId: string;
  categoryKey: string;
  equipmentType: EquipmentType;
  selectedSlug: string | null;
  onSelect: (slug: string, source: string) => void;
}) {
  const [items, setItems] = useState<CategoryItemRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [empty, setEmpty] = useState(false);

  async function loadItems(q?: string) {
    setLoading(true);
    try {
      const data = await fetchCategoryItems(worldId, equipmentType, q);
      setItems(data);
      setEmpty(data.length === 0);
    } catch {
      setItems([]);
      setEmpty(true);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    if (items === null) loadItems();
  }

  const filtered = items
    ? items.filter(
        (i) =>
          !query.trim() || i.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : [];

  return (
    <div className="mt-1" data-testid={`category-picker-${categoryKey}`}>
      {!open ? (
        <button
          type="button"
          onClick={handleOpen}
          className="w-full min-h-[44px] rounded-md border border-accent-soft bg-paper px-3 py-2 text-left text-sm text-accent-deep transition hover:border-accent"
        >
          {selectedSlug
            ? `✓ ${selectedSlug}`
            : `Elegir ${equipmentTypeLabel(equipmentType)}…`}
        </button>
      ) : (
        <div className="rounded-md border border-accent-soft bg-paper">
          <div className="flex items-center gap-2 p-2 border-b border-line">
            <input
              type="search"
              placeholder={`Buscar ${equipmentTypeLabel(equipmentType)}…`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              className="flex-1 rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink placeholder:text-ink-mute focus:border-primary focus:outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-ink-mute px-2 py-1 hover:text-ink"
            >
              ✕
            </button>
          </div>
          {loading && (
            <p className="px-3 py-2 text-xs text-ink-mute">Cargando…</p>
          )}
          {empty && !loading && (
            <p className="px-3 py-2 text-xs text-ink-mute">
              No items available for this category
            </p>
          )}
          {!loading && filtered.length > 0 && (
            <ul className="max-h-48 overflow-y-auto divide-y divide-line">
              {filtered.map((item) => (
                <li key={`${item.slug}|${item.source}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(item.slug, item.source);
                      setOpen(false);
                    }}
                    className={[
                      'w-full min-h-[44px] px-3 py-2 text-left text-sm transition',
                      selectedSlug === item.slug
                        ? 'bg-accent-soft text-accent-deep font-semibold'
                        : 'text-ink hover:bg-surface',
                    ].join(' ')}
                  >
                    {item.name}
                    {selectedSlug === item.slug && ' ✓'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Choice row renderer ──────────────────────────────────────────────────────

function ChoiceRowSection({
  row,
  rowIndex,
  prefix,
  worldId,
  chosenSlot,
  categoryPicks,
  onSlotSelect,
  onCategoryPick,
}: {
  row: ParsedChoiceRow;
  rowIndex: number;
  prefix: 'class' | 'background';
  worldId: string;
  chosenSlot: 'a' | 'b' | 'c' | undefined;
  categoryPicks: Record<string, { slug: string; source: string }>;
  onSlotSelect: (slot: 'a' | 'b' | 'c') => void;
  onCategoryPick: (key: string, slug: string, source: string) => void;
}) {
  return (
    <div
      className="space-y-2"
      role="radiogroup"
      aria-label={`Fila de elección ${rowIndex + 1}`}
    >
      {row.options.map((option) => {
        const isSelected = chosenSlot === option.slot;
        let catIdx = 0;

        return (
          <label
            key={option.slot}
            className={[
              'flex min-h-[44px] cursor-pointer flex-col rounded-md border p-3 transition',
              isSelected
                ? 'border-accent bg-accent-soft'
                : 'border-line bg-paper hover:border-accent-soft',
            ].join(' ')}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name={`${prefix}-row${rowIndex}`}
                value={option.slot}
                checked={isSelected}
                onChange={() => onSlotSelect(option.slot)}
                className="mt-0.5 accent-primary"
                aria-label={`Opción ${option.slot.toUpperCase()}`}
              />
              <div className="flex-1 space-y-0.5">
                {option.refs.map((ref, ri) => {
                  if (isCategoryRef(ref)) {
                    const catKey = `row${rowIndex}-${option.slot}-cat${catIdx}`;
                    catIdx++;
                    const pick = categoryPicks[catKey];
                    return (
                      <div key={ri}>
                        <p className="text-xs text-ink-mute">
                          Elige{ref.quantity > 1 ? ` ${ref.quantity}` : ''}{' '}
                          {equipmentTypeLabel(ref.equipmentType)}:
                        </p>
                        {isSelected && (
                          <CategoryPickerInline
                            worldId={worldId}
                            categoryKey={catKey}
                            equipmentType={ref.equipmentType}
                            selectedSlug={pick?.slug ?? null}
                            onSelect={(slug, source) =>
                              onCategoryPick(catKey, slug, source)
                            }
                          />
                        )}
                        {!isSelected && pick && (
                          <p className="text-xs text-accent-deep">✓ {pick.slug}</p>
                        )}
                      </div>
                    );
                  }
                  return (
                    <p key={ri} className="text-xs text-ink">
                      {refLabel(ref)}
                    </p>
                  );
                })}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}

// ─── Fixed items list ─────────────────────────────────────────────────────────

function FixedItemsList({ refs }: { refs: ParsedRef[] }) {
  if (refs.length === 0) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute mb-1.5">
        Siempre recibís
      </p>
      <ul className="space-y-0.5">
        {refs.map((ref, i) => (
          <li key={i} className="text-xs text-ink">
            {refLabel(ref)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Main picker component ────────────────────────────────────────────────────

export type EquipmentPickerProps = {
  characterId: string;
  worldId: string;
  parsedClass: ParsedClassEquipment;
  parsedBackground: ParsedBackgroundEquipment;
  initialSelections: EquipmentSelections | null;
};

export function EquipmentPicker({
  characterId,
  worldId,
  parsedClass,
  parsedBackground,
  initialSelections,
}: EquipmentPickerProps) {
  const [classPath, setClassPath] = useState<'package' | 'gold'>(
    initialSelections?.classPath ?? 'package',
  );
  const [goldValue, setGoldValue] = useState<string>(
    initialSelections?.goldValue?.toString() ?? '',
  );
  const [classRowChoices, setClassRowChoices] = useState<Record<string, 'a' | 'b' | 'c'>>(
    (initialSelections?.classRowChoices as Record<string, 'a' | 'b' | 'c'>) ?? {},
  );
  const [classCategoryPicks, setClassCategoryPicks] = useState<
    Record<string, { slug: string; source: string }>
  >(initialSelections?.classCategoryPicks ?? {});
  const [backgroundRowChoices, setBackgroundRowChoices] = useState<
    Record<string, 'a' | 'b' | 'c'>
  >(
    (initialSelections?.backgroundRowChoices as Record<string, 'a' | 'b' | 'c'>) ?? {},
  );
  const [backgroundCategoryPicks, setBackgroundCategoryPicks] = useState<
    Record<string, { slug: string; source: string }>
  >(initialSelections?.backgroundCategoryPicks ?? {});

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function buildSelections(): EquipmentSelections {
    const rowChoicesAsNumbers = Object.fromEntries(
      Object.entries(classRowChoices).map(([k, v]) => [Number(k), v]),
    );
    const bgRowChoicesAsNumbers = Object.fromEntries(
      Object.entries(backgroundRowChoices).map(([k, v]) => [Number(k), v]),
    );
    return {
      classPath,
      goldValue: classPath === 'gold' ? parseInt(goldValue || '0', 10) : undefined,
      classRowChoices: rowChoicesAsNumbers as Record<number, 'a' | 'b' | 'c'>,
      classCategoryPicks,
      backgroundRowChoices: bgRowChoicesAsNumbers as Record<number, 'a' | 'b' | 'c'>,
      backgroundCategoryPicks,
    };
  }

  function handleRollGold() {
    if (!parsedClass.goldAlternative) return;
    const rolled = rollStartingGold(parsedClass.goldAlternative.dice, Math.random);
    setGoldValue(String(rolled));
  }

  function handleContinue() {
    setError(null);

    if (classPath === 'gold') {
      const parsed = parseInt(goldValue, 10);
      if (!goldValue.trim() || isNaN(parsed) || parsed < 0) {
        setError('Ingresá un valor de oro válido (número entero no negativo).');
        return;
      }
    }

    const selections = buildSelections();
    startTransition(async () => {
      const res = await saveEquipmentSelections(characterId, selections);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      {/* Package-vs-gold fork */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute mb-2">
          Tipo de inicio
        </p>
        <div
          className="flex flex-col gap-2"
          role="radiogroup"
          aria-label="Tipo de equipo inicial"
        >
          <label
            className={[
              'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition',
              classPath === 'package'
                ? 'border-accent bg-accent-soft text-accent-deep font-semibold'
                : 'border-line bg-paper text-ink hover:border-accent-soft',
            ].join(' ')}
          >
            <input
              type="radio"
              name="class-path"
              value="package"
              checked={classPath === 'package'}
              onChange={() => setClassPath('package')}
              className="accent-primary"
            />
            <div>
              <p className="font-medium">Paquete de equipo</p>
              <p className="text-xs text-ink-mute font-normal">
                Elegí las opciones de equipo de tu clase
              </p>
            </div>
          </label>

          {parsedClass.goldAlternative && (
            <label
              className={[
                'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition',
                classPath === 'gold'
                  ? 'border-accent bg-accent-soft text-accent-deep font-semibold'
                  : 'border-line bg-paper text-ink hover:border-accent-soft',
              ].join(' ')}
            >
              <input
                type="radio"
                name="class-path"
                value="gold"
                checked={classPath === 'gold'}
                onChange={() => setClassPath('gold')}
                className="accent-primary"
              />
              <div>
                <p className="font-medium">
                  Oro inicial ({parsedClass.goldAlternative.dice} po)
                </p>
                <p className="text-xs text-ink-mute font-normal">
                  Comenzás con oro para comprar equipo
                </p>
              </div>
            </label>
          )}
        </div>
      </div>

      {/* Gold path: field + roll button */}
      {classPath === 'gold' && parsedClass.goldAlternative && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute mb-2">
            Valor de oro (po)
          </p>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min="0"
              value={goldValue}
              onChange={(e) => setGoldValue(e.target.value)}
              placeholder="0"
              className="w-28 rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-primary focus:outline-none"
              aria-label="Valor de oro en piezas de oro"
            />
            <button
              type="button"
              onClick={handleRollGold}
              className="min-h-[44px] rounded-md border border-accent bg-accent-soft px-4 text-sm font-semibold text-accent-deep transition hover:bg-accent/20"
              aria-label={`Tirar ${parsedClass.goldAlternative.dice}`}
            >
              Tirar ({parsedClass.goldAlternative.dice})
            </button>
          </div>
          {goldValue && parseInt(goldValue, 10) > 0 && (
            <p className="mt-1 text-xs text-ink-mute">= {parseInt(goldValue, 10)} po</p>
          )}
        </div>
      )}

      {/* Package path: class choices */}
      {classPath === 'package' && (
        <div className="space-y-4">
          {/* Fixed class items */}
          <FixedItemsList refs={parsedClass.fixedItems} />

          {/* Class choice rows */}
          {parsedClass.choiceRows.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute mb-2">
                Equipo de clase
              </p>
              <div className="space-y-4">
                {parsedClass.choiceRows.map((row, rowIdx) => (
                  <ChoiceRowSection
                    key={rowIdx}
                    row={row}
                    rowIndex={rowIdx}
                    prefix="class"
                    worldId={worldId}
                    chosenSlot={classRowChoices[String(rowIdx)] ?? undefined}
                    categoryPicks={classCategoryPicks}
                    onSlotSelect={(slot) =>
                      setClassRowChoices((prev) => ({ ...prev, [rowIdx]: slot }))
                    }
                    onCategoryPick={(key, slug, source) =>
                      setClassCategoryPicks((prev) => ({ ...prev, [key]: { slug, source } }))
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Background equipment — always shown */}
      {(parsedBackground.fixedItems.length > 0 ||
        parsedBackground.choiceRows.length > 0 ||
        parsedBackground.specialItems.length > 0 ||
        parsedBackground.currency > 0) && (
        <div className="space-y-3 border-t border-line pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">
            Equipo de trasfondo
          </p>

          <FixedItemsList refs={parsedBackground.fixedItems} />

          {parsedBackground.specialItems.length > 0 && (
            <div className="rounded-md border border-line bg-surface px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute mb-1.5">
                Objetos especiales
              </p>
              <ul className="space-y-0.5">
                {parsedBackground.specialItems.map((s, i) => (
                  <li key={i} className="text-xs text-ink-soft italic">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parsedBackground.currency > 0 && (
            <div className="rounded-md border border-line bg-surface px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute mb-1">
                Monedas del trasfondo
              </p>
              <p className="text-xs text-ink">
                {parsedBackground.currency} pc (= {parsedBackground.currency / 100} po)
              </p>
            </div>
          )}

          {parsedBackground.choiceRows.length > 0 && (
            <div className="space-y-4">
              {parsedBackground.choiceRows.map((row, rowIdx) => (
                <ChoiceRowSection
                  key={rowIdx}
                  row={row}
                  rowIndex={rowIdx}
                  prefix="background"
                  worldId={worldId}
                  chosenSlot={backgroundRowChoices[String(rowIdx)] ?? undefined}
                  categoryPicks={backgroundCategoryPicks}
                  onSlotSelect={(slot) =>
                    setBackgroundRowChoices((prev) => ({ ...prev, [rowIdx]: slot }))
                  }
                  onCategoryPick={(key, slug, source) =>
                    setBackgroundCategoryPicks((prev) => ({
                      ...prev,
                      [key]: { slug, source },
                    }))
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      <WizardFooterNav
        backHref={`/characters/${characterId}/wizard/background`}
        onNext={handleContinue}
        pending={pending}
        error={error}
      />
    </div>
  );
}
