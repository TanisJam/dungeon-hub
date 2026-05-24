/**
 * Unit tests: RaceCantripCard
 *
 * Tests:
 * - T-1: renders the cantrip name passed as prop
 * - T-2: renders "LINAJE" heading label
 * - T-3: renders without crashing on minimal props
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RaceCantripCard } from './_race-cantrip-card';

describe('RaceCantripCard', () => {
  it('T-1: renders the cantrip name', () => {
    render(<RaceCantripCard cantripName="Mending" />);
    expect(screen.getByText('Mending')).toBeTruthy();
  });

  it('T-2: renders "LINAJE" heading label', () => {
    render(<RaceCantripCard cantripName="Fire Bolt" />);
    expect(screen.getByText('LINAJE')).toBeTruthy();
  });

  it('T-3: renders without crashing on minimal props', () => {
    const { container } = render(<RaceCantripCard cantripName="Prestidigitation" />);
    expect(container.firstChild).toBeTruthy();
  });
});
