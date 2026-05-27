/**
 * Tests for VitalGrid — ficha-* class assertions.
 *
 * T1: HP tile has class ficha-vital-hp.
 * T2: AC tile has class ficha-vital-ac.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
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
});
