// FormSubmitButton — B1 presentational primitive (web-component-catalog)
// bg-ink form-submit treatment — distinct from ui/Button (CTA gradient tones). REQ-B1-01.
// min-h-[44px] preserved (REQ-B1-05 touch target). SCENARIO-B1-03.

interface FormSubmitButtonProps {
  pending: boolean;
  idleLabel: string;
  pendingLabel?: string;
}

export function FormSubmitButton({
  pending,
  idleLabel,
  pendingLabel = 'Guardando…',
}: FormSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[44px] w-full rounded-md bg-ink px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-ink/80 disabled:opacity-50"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
