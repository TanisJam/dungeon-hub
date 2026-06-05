import { ScreenFrame, ScreenSection } from '../_screen-frame';

// personajes/ presentational component
import { CreatePersonajeCTA } from '@/components/personajes/create-personaje-cta';

// personajes/ interactive islands (catalog)
import { StatusFilterChipsIsland } from '../../components/_islands/status-filter-chips-island';
import { PersonajeCardIsland } from '../../components/_islands/personaje-card-island';

// ── Component ─────────────────────────────────────────────────────────────────

export function PersonajesScreen() {
  return (
    <ScreenSection
      name="Personajes"
      route="/personajes"
      notes="StatusFilterChipsIsland (interactive, local state) → PersonajeCardIsland ×3 (active, pending, draft) → CreatePersonajeCTA. Single player view."
    >
      <div className="space-y-1">
        <div className="font-mono text-[10px] text-ink-mute">Player roster</div>
        <ScreenFrame title="Personajes" subtitle="TU ROSTER" role="player" activeTab="Inicio" lead="crow">
          <div className="space-y-3">
            <StatusFilterChipsIsland />
            <div className="space-y-2">
              <PersonajeCardIsland variant="active" />
              <PersonajeCardIsland variant="pending" />
              <PersonajeCardIsland variant="draft" />
            </div>
            <CreatePersonajeCTA />
          </div>
        </ScreenFrame>
      </div>
    </ScreenSection>
  );
}
