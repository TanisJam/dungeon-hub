
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { FormInput } from './form-input';

describe('FormInput', () => {
  it('T1: renders <input> by default with min-h-[44px] class', () => {
    render(<FormInput id="test" value="" onChange={() => {}} />);
    const input = document.querySelector('input');
    expect(input).toBeTruthy();
    expect(input?.className).toContain('min-h-[44px]');
  });

  it('T2: multiline=true renders <textarea> WITHOUT min-h-[44px]', () => {
    render(<FormInput id="test" multiline value="" onChange={() => {}} />);
    const textarea = document.querySelector('textarea');
    expect(textarea).toBeTruthy();
    expect(textarea?.className).not.toContain('min-h-[44px]');
    // No input should be in the DOM
    expect(document.querySelector('input')).toBeNull();
  });

  it('T3: forwards value and onChange to the underlying element', () => {
    let changed = false;
    render(
      <FormInput
        id="test"
        value="hello"
        onChange={() => {
          changed = true;
        }}
      />,
    );
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('hello');
    fireEvent.change(input, { target: { value: 'world' } });
    expect(changed).toBe(true);
  });

  it('T4: forwards id prop to the underlying element', () => {
    render(<FormInput id="npc-name" value="" onChange={() => {}} />);
    const input = document.querySelector('input');
    expect(input?.id).toBe('npc-name');
  });
});
