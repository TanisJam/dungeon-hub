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
  error?: string | null;
};

export function WizardFooterNav({
  backHref,
  nextLabel = 'Siguiente',
  nextIcon = 'arrow-right',
  onNext,
  pending,
  disabled,
  error,
}: WizardFooterNavProps) {
  return (
    <>
      {/* Spacer: pushes scrollable content past the fixed footer so the
          last item isn't hidden behind it. Sits above the TabBar (56px) + this
          footer (~64px, more with error). Keep generous slack. */}
      <div className="h-28" aria-hidden />

      {/* Fixed footer pinned just above the bottom TabBar. */}
      <div className="fixed bottom-14 left-0 right-0 z-30 border-t border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
        {pending && (
          <div className="absolute left-0 right-0 top-0 h-0.5 overflow-hidden">
            <div className="h-full w-1/3 animate-[wizard-loading_1.2s_ease-in-out_infinite] bg-primary" />
          </div>
        )}
        <div className="mx-auto max-w-sm px-4 py-3">
          {error && (
            <p
              role="alert"
              className="mb-2 text-center text-xs font-medium text-warning-deep"
            >
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
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
      </div>
    </>
  );
}
