'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface PublishedSplashProps {
  characterName: string;
}

export function PublishedSplash({ characterName }: PublishedSplashProps) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goToDashboard = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    router.push('/dashboard');
  };

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      router.push('/dashboard');
    }, 4000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [router]);

  return (
    <div
      onClick={goToDashboard}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
      style={{
        background:
          'radial-gradient(120% 80% at 30% 20%, rgba(232,148,111,0.55), transparent 55%), radial-gradient(80% 60% at 70% 80%, rgba(205,98,98,0.40), transparent 55%), linear-gradient(160deg, #E8946F 0%, #C56262 60%, #2A2240 100%)',
      }}
    >
      {/* Glow orb */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 40%, rgba(255,220,180,0.25), transparent 70%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6 px-8 text-center max-w-sm">
        {/* Icon */}
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full text-4xl shadow-[0_8px_32px_rgba(232,148,111,0.5)]"
          style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
        >
          ✦
        </div>

        <div>
          <h1 className="font-display text-3xl font-bold text-white leading-tight">
            ¡Enviado al DM!
          </h1>
          <p className="mt-2 text-lg font-semibold text-white/90">{characterName}</p>
          <p className="mt-1 text-sm text-white/70">Tu personaje está esperando aprobación.</p>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); goToDashboard(); }}
          className="mt-2 inline-flex items-center gap-2 rounded-pill bg-white/20 px-5 py-2.5 text-sm font-bold text-white backdrop-blur-sm hover:bg-white/30 transition-colors border border-white/30"
        >
          Volver al inicio →
        </button>

        <p className="text-xs text-white/50">Redirigiendo en 4 segundos…</p>
      </div>
    </div>
  );
}
