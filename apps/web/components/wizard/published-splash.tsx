import Link from 'next/link';
import { Button } from '@/components/ui';

export interface PublishedSplashProps {
  characterId: string;
  characterName: string;
  raceLabel?: string;
  classLabel?: string;
  level: number;
}

export function PublishedSplash({
  characterId,
  characterName,
  raceLabel,
  classLabel,
  level,
}: PublishedSplashProps) {
  const identityParts = [raceLabel, classLabel, `Nivel ${level}`].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      {/* Dark gradient announcement card */}
      <div className="w-full max-w-sm rounded-lg bg-gradient-to-br from-ink to-[#1B1428] border border-line shadow-[0_12px_32px_rgba(39,30,51,0.25)] p-6 text-center">
        <p className="text-[11px] italic text-paper-soft/70 mb-1">
          Bienvenido al gremio
        </p>
        <h2 className="font-display font-bold text-[28px] leading-tight text-paper tracking-tight">
          {characterName}
        </h2>
        <p className="text-sm italic text-paper-soft/60 mt-0.5">
          está listo
        </p>
        {identityParts && (
          <p className="mt-2 text-[11px] text-paper-soft/50">
            {identityParts}
          </p>
        )}
      </div>

      {/* Status pill */}
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent-soft px-3 py-1 text-xs font-medium text-accent-deep">
        ✓ Enviado al DM para aprobación
      </span>

      {/* Subtitle */}
      <p className="max-w-sm text-center text-xs text-ink-mute">
        Te avisamos por Discord cuando esté aprobado. Mientras tanto, podés afinar el trasfondo en notas.
      </p>

      {/* CTA link */}
      <Button asChild tone="cta" size="md" href={`/characters/${characterId}`}>
        🏠 Ir al perfil
      </Button>
    </div>
  );
}
