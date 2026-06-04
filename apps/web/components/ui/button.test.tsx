/**
 * Unit tests for Button component — fullWidth prop
 *
 * T1: renders children text
 * T2: fullWidth adds w-full to className
 * T3: fullWidth adds min-h-[44px] to className
 * T4: WITHOUT fullWidth, className does NOT contain w-full
 * T5: fullWidth composes with tone and caller className (e.g. tone="ghost" + className="mt-2")
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('T1: renders children text', () => {
    render(<Button>Atacar</Button>);
    expect(screen.getByRole('button', { name: 'Atacar' })).toBeTruthy();
  });

  it('T2: fullWidth adds w-full to className', () => {
    render(<Button fullWidth>Atacar</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('w-full');
  });

  it('T3: fullWidth adds min-h-[44px] to className', () => {
    render(<Button fullWidth>Atacar</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('min-h-[44px]');
  });

  it('T4: WITHOUT fullWidth, className does NOT contain w-full', () => {
    render(<Button>Atacar</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).not.toContain('w-full');
  });

  it('T5: fullWidth composes with tone="ghost" and caller className="mt-2"', () => {
    render(
      <Button tone="ghost" fullWidth className="mt-2">
        Cerrar
      </Button>,
    );
    const btn = screen.getByRole('button');
    // fullWidth classes present
    expect(btn.className).toContain('w-full');
    expect(btn.className).toContain('min-h-[44px]');
    // ghost tone class present
    expect(btn.className).toContain('bg-transparent');
    // caller className preserved
    expect(btn.className).toContain('mt-2');
  });
});
