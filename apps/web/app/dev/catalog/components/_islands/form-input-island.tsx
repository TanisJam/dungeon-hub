'use client';

import { useState } from 'react';
import { FormInput } from '@/components/ui/form-input';

/**
 * Dev-only client island for FormInput. The registry (a server module) cannot
 * pass an `onChange` handler across the server→client boundary, so the island
 * owns the controlled state here and exposes only serializable display props.
 */
export function FormInputIsland(props: {
  id: string;
  multiline?: boolean;
  value?: string;
  placeholder?: string;
  rows?: number;
}) {
  const { value: initial, ...rest } = props;
  const [value, setValue] = useState(initial ?? '');
  return <FormInput {...rest} value={value} onChange={(e) => setValue(e.target.value)} />;
}
