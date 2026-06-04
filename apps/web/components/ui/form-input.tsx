// FormInput — B1 presentational primitive (web-component-catalog)
// multiline=false → <input> with min-h-[44px] (REQ-B1-05 touch target).
// multiline=true  → <textarea> without min-h (textarea variant from canonical forms).
// No validation logic. REQ-B1-01, REQ-B1-05.
//
// onChange type: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> so callers
// don't need to cast — the event target value is always string regardless of element.

import type { ChangeEvent } from 'react';

const inputClass =
  'min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20';

const textareaClass =
  'w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20';

interface FormInputSharedProps {
  id: string;
  value: string | number;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  required?: boolean;
  rows?: number;
  type?: string;
}

export function FormInput({
  id,
  value,
  onChange,
  multiline = false,
  className,
  placeholder,
  required,
  rows,
  type,
}: FormInputSharedProps) {
  if (multiline) {
    return (
      <textarea
        id={id}
        value={value}
        onChange={onChange as (e: ChangeEvent<HTMLTextAreaElement>) => void}
        className={className ? `${textareaClass} ${className}` : textareaClass}
        placeholder={placeholder}
        required={required}
        rows={rows}
      />
    );
  }
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={onChange as (e: ChangeEvent<HTMLInputElement>) => void}
      className={className ? `${inputClass} ${className}` : inputClass}
      placeholder={placeholder}
      required={required}
    />
  );
}
