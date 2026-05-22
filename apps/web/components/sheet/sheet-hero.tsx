interface SheetHeroProps {
  name: string;
  classSummary: string; // e.g. "Humano · Paladín 1"
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

export function SheetHero({ name, classSummary }: SheetHeroProps) {
  const initials = getInitials(name);

  return (
    <div
      className="relative overflow-hidden rounded-lg px-5 py-6 text-white"
      style={{
        background:
          'radial-gradient(120% 80% at 10% 0%, rgba(111,134,201,0.45), transparent 55%), radial-gradient(70% 60% at 90% 100%, rgba(140,100,200,0.35), transparent 55%), linear-gradient(180deg, #2A2240 0%, #1B1428 100%)',
      }}
    >
      {/* Aurora radials */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 50% 30% at 70% 20%, rgba(232,148,111,0.18), transparent 60%)',
        }}
      />

      <div className="relative z-10 flex items-center gap-4">
        {/* Portrait placeholder — initials circle */}
        <div
          className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full text-3xl font-bold font-display text-white shadow-[0_0_0_3px_rgba(232,148,111,0.5),0_0_0_6px_rgba(232,148,111,0.15)]"
          style={{
            background:
              'conic-gradient(from 180deg, #E8946F, #6F86C9, #8C64C8, #E8946F)',
          }}
          aria-label={`Iniciales de ${name}`}
        >
          <span
            className="flex h-[calc(100%-4px)] w-[calc(100%-4px)] items-center justify-center rounded-full"
            style={{ background: 'linear-gradient(135deg, #2A2240, #1B1428)' }}
          >
            {initials}
          </span>
        </div>

        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold leading-tight text-white truncate">
            {name}
          </h1>
          <p className="mt-1 text-sm text-white/70 truncate">{classSummary}</p>
        </div>
      </div>
    </div>
  );
}
