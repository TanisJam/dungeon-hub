'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';

type WizardFooterNavProps = {
  backHref?: string;
  nextLabel?: string;
  nextIcon?: 'arrow-right' | 'check';
  onNext: () => void;
  pending?: boolean;
  disabled?: boolean;
};

export function WizardFooterNav({
  backHref,
  nextLabel = 'Siguiente',
  nextIcon = 'arrow-right',
  onNext,
  pending,
  disabled,
}: WizardFooterNavProps) {
  return (
    <>
      {/* Spacer: pushes scrollable content past the fixed footer so the
          last item isn't hidden behind it. Sits above the TabBar (56px) + this
          footer (~64px) → keep some safe slack. */}
      <div className="h-24" aria-hidden />

      {/* Fixed footer pinned just above the bottom TabBar. */}
      <div className="fixed bottom-14 left-0 right-0 z-30 border-t border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
        <div className="mx-auto flex max-w-sm items-center justify-between gap-3 px-4 py-3">
          {backHref ? (
            <Link href={backHref}>
              <Button tone="ghost" size="md">
                ← Atrás
              </Button>
            </Link>
          ) : (
            <Button tone="ghost" size="md" disabled>
              ← Atrás
            </Button>
          )}
          <Button
            tone="cta"
            size="md"
            onClick={onNext}
            disabled={pending || disabled}
          >
            {pending ? 'Guardando…' : (
              <>
                {nextLabel}
                {nextIcon === 'arrow-right' ? ' →' : ' ✓'}
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
