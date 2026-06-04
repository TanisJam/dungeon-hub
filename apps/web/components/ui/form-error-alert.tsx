// FormErrorAlert — B1 presentational primitive (web-component-catalog)
// REQ-B1-04: uses bg-danger-soft / text-danger semantic tokens (spec authority over design note).
// Renders null when message is falsy; renders role="alert" <p> otherwise.
// SCENARIO-B1-02.

interface FormErrorAlertProps {
  message: string | null;
}

export function FormErrorAlert({ message }: FormErrorAlertProps) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}
