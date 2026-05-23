/**
 * Direct unit tests for TermCard.
 *
 * TERM-RENDER — loading skeleton, ok entry, and error state.
 * No provider needed — TermCard is a pure presentational component.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TermCard } from '../TermCard';

// ---------------------------------------------------------------------------
// TERM-RENDER — state="loading" renders LoadingSkeleton
// ---------------------------------------------------------------------------

describe('TermCard — state="loading"', () => {
  it('renders an animate-pulse skeleton element', () => {
    const { container } = render(<TermCard state="loading" />);

    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TERM-RENDER — state="ok" renders entry name and prose
// ---------------------------------------------------------------------------

describe('TermCard — state="ok"', () => {
  it('renders the entry name', () => {
    render(
      <TermCard
        state="ok"
        entry={{ name: 'Fireball', entries: ['A bright streak.'], source: 'PHB' }}
      />,
    );

    expect(screen.getByText('Fireball')).not.toBeNull();
  });

  it('renders the entry prose text', () => {
    const { container } = render(
      <TermCard
        state="ok"
        entry={{ name: 'Fireball', entries: ['A bright streak.'], source: 'PHB' }}
      />,
    );

    // CompendiumEntries wraps prose in elements — check container text content
    expect(container.textContent).toContain('A bright streak.');
  });
});

// ---------------------------------------------------------------------------
// TERM-RENDER — state="error" renders error string / fallback message
// ---------------------------------------------------------------------------

describe('TermCard — state="error"', () => {
  it('renders the fallback "No preview available" when no error string is given', () => {
    render(<TermCard state="error" />);

    expect(screen.getByText('No preview available')).not.toBeNull();
  });

  it('renders the provided error string when given', () => {
    render(<TermCard state="error" error="Entry not found" />);

    expect(screen.getByText('Entry not found')).not.toBeNull();
  });
});
