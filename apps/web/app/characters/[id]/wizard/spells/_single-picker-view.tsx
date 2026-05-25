'use client';

import { useState, useTransition } from 'react';
import { WizardFooterNav } from '@/components/wizard/wizard-footer-nav';
import { SpellsPicker, validateSpellsPick } from './_picker';
import type { AppliedClassSpells, SpellLimitsView, AvailableSpell } from './_picker';
import { saveSpellsForClass, proceedToReview } from './actions';

type SinglePickerViewProps = {
  characterId: string;
  classSlug: string;
  classSource: string;
  limits: SpellLimitsView;
  availableSpells: AvailableSpell[];
  subclassGrantedSlugs: string[];
  backHref?: string;
  initialPicks: AppliedClassSpells;
};

export function SinglePickerView({
  characterId,
  classSlug,
  classSource,
  limits,
  availableSpells,
  subclassGrantedSlugs,
  backHref,
  initialPicks,
}: SinglePickerViewProps) {
  const [picks, setPicks] = useState<AppliedClassSpells>(initialPicks);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    const validationError = validateSpellsPick(limits, subclassGrantedSlugs, picks);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await saveSpellsForClass({
        characterId,
        classSlug,
        cantrips: picks.cantrips,
        known: picks.known,
        prepared: picks.prepared,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await proceedToReview(characterId);
    });
  }

  return (
    <>
      <SpellsPicker
        classSlug={classSlug}
        classSource={classSource}
        limits={limits}
        availableSpells={availableSpells}
        subclassGrantedSlugs={subclassGrantedSlugs}
        value={picks}
        onChange={setPicks}
      />
      <WizardFooterNav
        backHref={backHref}
        onNext={handleSave}
        pending={pending}
        error={error}
      />
    </>
  );
}
