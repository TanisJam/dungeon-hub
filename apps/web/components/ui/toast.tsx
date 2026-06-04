// Toast — C5 web-component-catalog
// Renders a transient notice in the warning-soft style (bg-warning-soft / text-warning-deep).
// Preserves the exact visual from resource-panel.tsx and rage-controls.tsx.
// Renders null when message is falsy.

interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="text-xs text-center px-3 py-2 bg-warning-soft text-warning-deep rounded"
    >
      {message}
    </div>
  );
}
