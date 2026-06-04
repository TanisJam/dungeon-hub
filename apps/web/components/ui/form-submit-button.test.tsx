/**
 * Unit tests for FormSubmitButton component — B1 (web-component-catalog)
 *
 * T1: renders button with idleLabel text when pending=false
 * T2: renders pendingLabel when pending=true
 * T3: button has disabled attribute when pending=true
 * T4: button has min-h-[44px] class (REQ-B1-05 touch target)
 *
 * Round-trip test (REQ-B1-09 / §5):
 * T5: submit button is disabled while async onSubmit is in-flight
 */
import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FormLabel } from './form-label';
import { FormInput } from './form-input';
import { FormSubmitButton } from './form-submit-button';

describe('FormSubmitButton', () => {
  it('T1: renders button with idleLabel when pending=false', () => {
    render(<FormSubmitButton pending={false} idleLabel="Crear NPC" />);
    expect(screen.getByRole('button', { name: 'Crear NPC' })).toBeTruthy();
  });

  it('T2: renders pendingLabel when pending=true', () => {
    render(<FormSubmitButton pending={true} idleLabel="Crear NPC" pendingLabel="Guardando…" />);
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeTruthy();
  });

  it('T2b: renders default pendingLabel "Guardando…" when pendingLabel not provided', () => {
    render(<FormSubmitButton pending={true} idleLabel="Crear NPC" />);
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeTruthy();
  });

  it('T3: button is disabled when pending=true', () => {
    render(<FormSubmitButton pending={true} idleLabel="Crear NPC" />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('T3b: button is NOT disabled when pending=false', () => {
    render(<FormSubmitButton pending={false} idleLabel="Crear NPC" />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('T4: button has min-h-[44px] class', () => {
    render(<FormSubmitButton pending={false} idleLabel="Crear NPC" />);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('min-h-[44px]');
  });
});

// ── Round-trip: FormLabel + FormInput + FormSubmitButton in a minimal NPC-shaped tree ──
// Proves the three primitives compose correctly in a form tree (§5 round-trip concern).

function MinimalNpcFormFixture({
  onSubmit,
}: {
  onSubmit: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit();
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormLabel htmlFor="npc-name" required>
        Nombre
      </FormLabel>
      <FormInput
        id="npc-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <FormSubmitButton pending={submitting} idleLabel="Crear NPC" />
    </form>
  );
}

describe('FormSubmitButton — round-trip (REQ-B1-09 §5)', () => {
  it('T5: submit button becomes disabled when pending=true and re-enables after submit resolves', async () => {
    // Use a promise we can resolve manually
    let resolve!: () => void;
    const inflightPromise = new Promise<void>((r) => {
      resolve = r;
    });

    render(<MinimalNpcFormFixture onSubmit={() => inflightPromise} />);
    const form = document.querySelector('form')!;
    const btn = screen.getByRole('button') as HTMLButtonElement;

    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Crear NPC');

    // Trigger submit — button goes pending
    act(() => {
      fireEvent.submit(form);
    });

    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Guardando…');

    // Resolve the in-flight promise — button becomes idle
    await act(async () => {
      resolve();
    });

    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Crear NPC');
  });
});
