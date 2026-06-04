// FormLabel — B1 presentational primitive (web-component-catalog)
// Canonical labelClass from the 4 aligned world forms (npc/faction/event/journal).
// REQ-B1-01, SCENARIO-B1-04.

import type { ReactNode } from 'react';

const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft';

interface FormLabelProps {
  htmlFor: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}

export function FormLabel({ htmlFor, children, required, className }: FormLabelProps) {
  return (
    <label htmlFor={htmlFor} className={className ? `${labelClass} ${className}` : labelClass}>
      {children}
      {required && <span aria-hidden="true"> *</span>}
    </label>
  );
}
