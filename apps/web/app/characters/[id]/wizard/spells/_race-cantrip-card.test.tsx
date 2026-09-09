
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RaceCantripCard } from './_race-cantrip-card';

describe('RaceCantripCard', () => {
  it('T-1: renders the cantrip name', () => {
    render(<RaceCantripCard cantripName="Mending" raceName="Alto Elfo" />);
    expect(screen.getByText(/Mending/)).toBeTruthy();
  });

  it('T-2: renders "LINAJE" heading label', () => {
    render(<RaceCantripCard cantripName="Fire Bolt" raceName="Alto Elfo" />);
    expect(screen.getByText('LINAJE')).toBeTruthy();
  });

  it('T-3: renders without crashing on minimal props', () => {
    const { container } = render(<RaceCantripCard cantripName="Prestidigitation" raceName="Alto Elfo" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('T-4: renders the race name', () => {
    render(<RaceCantripCard cantripName="Mending" raceName="Alto Elfo" />);
    expect(screen.getByText('Alto Elfo · Mending')).toBeTruthy();
  });

  it('T-5: renders a different race name correctly', () => {
    render(<RaceCantripCard cantripName="Fire Bolt" raceName="Drow" />);
    expect(screen.getByText('Drow · Fire Bolt')).toBeTruthy();
  });
});
