'use client';

import { WizardFooterNav } from '@/components/wizard/wizard-footer-nav';

/**
 * Dev-only client island for WizardFooterNav.
 * Supplies a no-op onNext handler so the registry (a server module) does not
 * need to pass onClick/onNext across the server→client boundary.
 * Note: WizardFooterNav renders with `position: fixed` — the catalog frame
 * provides a relative container so the footer sits inside the 375px preview.
 */
export function WizardFooterNavIsland(props: {
  backHref?: string;
  nextLabel?: string;
  nextIcon?: 'arrow-right' | 'check';
  pending?: boolean;
  disabled?: boolean;
  error?: string | null;
}) {
  return (
    <WizardFooterNav
      backHref={props.backHref}
      nextLabel={props.nextLabel ?? 'Siguiente'}
      nextIcon={props.nextIcon ?? 'arrow-right'}
      onNext={() => {/* no-op in catalog preview */}}
      pending={props.pending}
      disabled={props.disabled}
      error={props.error}
    />
  );
}
