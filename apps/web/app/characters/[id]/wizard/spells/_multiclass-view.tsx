'use client';

import { useState, useTransition } from 'react';
import { WizardFooterNav } from '@/components/wizard/wizard-footer-nav';
import { SpellsPicker, validateSpellsPick } from './_picker';
import type { AppliedClassSpells, SpellLimitsView, AvailableSpell } from './_picker';
import { TabBar } from './_tab-bar';
import { saveSpellsForClass, proceedToReview } from './actions';

export type CasterTabData = {
  classSlug: string;
  classSource: string;
  className: string;
  limits: SpellLimitsView;
  availableSpells: AvailableSpell[];
  subclassGrantedSlugs: string[];
  initialPicks: AppliedClassSpells;
};

type MulticlassSpellsViewProps = {
  characterId: string;
  casterClasses: CasterTabData[]; // length >= 2, page-order
};

function makeEmptyPicks(): AppliedClassSpells {
  return { cantrips: [], known: [], prepared: [] };
}

export function MulticlassSpellsView({ characterId, casterClasses }: MulticlassSpellsViewProps) {
  // Lift state: active tab + picks per class
  const [activeClassSlug, setActiveClassSlug] = useState<string>(
    casterClasses[0]?.classSlug ?? '',
  );

  const [picksByClass, setPicksByClass] = useState<Record<string, AppliedClassSpells>>(() => {
    const initial: Record<string, AppliedClassSpells> = {};
    for (const tab of casterClasses) {
      initial[tab.classSlug] = tab.initialPicks ?? makeEmptyPicks();
    }
    return initial;
  });

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  const activeTab = casterClasses.find((t) => t.classSlug === activeClassSlug);

  // Build TabBar tabs with completeness badge
  const tabs = casterClasses.map((tab) => ({
    classSlug: tab.classSlug,
    label: tab.className,
    isComplete:
      validateSpellsPick(tab.limits, tab.subclassGrantedSlugs, picksByClass[tab.classSlug] ?? makeEmptyPicks()) === null,
  }));

  function updatePicks(classSlug: string, next: AppliedClassSpells) {
    setPicksByClass((prev) => ({ ...prev, [classSlug]: next }));
  }

  async function handleNext() {
    setSaveError(null);
    // Validate all tabs before saving
    for (const tab of casterClasses) {
      const err = validateSpellsPick(
        tab.limits,
        tab.subclassGrantedSlugs,
        picksByClass[tab.classSlug] ?? makeEmptyPicks(),
      );
      if (err) {
        setActiveClassSlug(tab.classSlug);
        setSaveError(err);
        return;
      }
    }

    // Sequential save
    startTransition(async () => {
      for (const tab of casterClasses) {
        const picks = picksByClass[tab.classSlug] ?? makeEmptyPicks();
        const result = await saveSpellsForClass({
          characterId,
          classSlug: tab.classSlug,
          cantrips: picks.cantrips,
          known: picks.known,
          prepared: picks.prepared,
        });
        if (!result.ok) {
          setActiveClassSlug(tab.classSlug);
          setSaveError(result.error);
          return;
        }
      }
      await proceedToReview(characterId);
    });
  }

  if (!activeTab) return null;

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <TabBar
        tabs={tabs}
        activeSlug={activeClassSlug}
        onTabChange={setActiveClassSlug}
      />

      {/* Error banner above picker */}
      {saveError && (
        <div
          role="alert"
          className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        >
          {saveError}
        </div>
      )}

      {/* Active picker — key ensures isolation on tab switch (Option A from design) */}
      <SpellsPicker
        key={activeClassSlug}
        classSlug={activeTab.classSlug}
        classSource={activeTab.classSource}
        limits={activeTab.limits}
        availableSpells={activeTab.availableSpells}
        subclassGrantedSlugs={activeTab.subclassGrantedSlugs}
        value={picksByClass[activeClassSlug] ?? makeEmptyPicks()}
        onChange={(next) => updatePicks(activeClassSlug, next)}
      />

      {/* Single footer for all tabs */}
      <WizardFooterNav
        onNext={handleNext}
        pending={saving}
        error={null}
      />
    </div>
  );
}
