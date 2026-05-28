import { Icon } from '@/components/ui';

interface CompendiumSearchTriggerProps {
  onOpen: () => void;
}

/**
 * CompendiumSearchTrigger — styled button (NOT input) that opens the spell detail sheet.
 * WCP-SEARCH-06: eye icon + placeholder text + ⌘K kbd hint.
 * WCDS-A11Y-03: aria-label for screen readers.
 */
export function CompendiumSearchTrigger({ onOpen }: CompendiumSearchTriggerProps) {
  return (
    <button
      type="button"
      className="compendium-init-search"
      onClick={onOpen}
      aria-label="Buscar en el compendium"
    >
      <Icon name="eye" size={14} />
      <span className="ph">Hechizo, item, monstruo, lore…</span>
      <span className="kbd">⌘K</span>
    </button>
  );
}
