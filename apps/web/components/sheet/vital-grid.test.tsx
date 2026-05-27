/**
 * Tests for VitalGrid — ficha-* class assertions + HPSectionEditor threading.
 *
 * T1: HP tile has class ficha-vital-hp.
 * T2: AC tile has class ficha-vital-ac.
 * T3: characterId + isDmHere=true → HPSectionEditor mounts.
 * T4: isDmHere=false → HPSectionEditor not mounted.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock HPSectionEditor — avoid 'use client' island in server-component context
vi.mock('@/components/ficha/hp/hp-section-editor', () => ({
  HPSectionEditor: ({ isDmHere }: { isDmHere: boolean }) => (
    <div data-testid="hp-section-editor" data-isdmhere={String(isDmHere)} />
  ),
}));

import { VitalGrid } from './vital-grid';

const defaultProps = {
  hp: { current: 25, max: 32 },
  ac: 15,
  initiative: 2,
};

describe('VitalGrid', () => {
  it('T1: HP tile has class ficha-vital-hp', () => {
    const { container } = render(<VitalGrid {...defaultProps} />);
    const hpTile = container.querySelector('.ficha-vital-hp');
    expect(hpTile).toBeTruthy();
  });

  it('T2: AC tile has class ficha-vital-ac', () => {
    const { container } = render(<VitalGrid {...defaultProps} />);
    const acTile = container.querySelector('.ficha-vital-ac');
    expect(acTile).toBeTruthy();
  });

  it('T3: characterId + isDmHere=true → HPSectionEditor mounts', () => {
    render(
      <VitalGrid
        {...defaultProps}
        characterId="char-1"
        isDmHere={true}
        tempHp={3}
      />,
    );
    const editor = screen.getByTestId('hp-section-editor');
    expect(editor).toBeTruthy();
    expect(editor.getAttribute('data-isdmhere')).toBe('true');
  });

  it('T4: no characterId → HPSectionEditor absent', () => {
    render(<VitalGrid {...defaultProps} isDmHere={false} />);
    expect(screen.queryByTestId('hp-section-editor')).toBeNull();
  });
});
