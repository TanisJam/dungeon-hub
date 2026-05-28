import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TurnControls } from './turn-controls';

describe('TurnControls', () => {
  it('WED-NEXT-BUTTON-03: clicking "Próximo turno" calls onAdvance', () => {
    const onAdvance = vi.fn();
    render(<TurnControls onAdvance={onAdvance} pending={false} />);
    fireEvent.click(screen.getByRole('button', { name: /próximo turno/i }));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
