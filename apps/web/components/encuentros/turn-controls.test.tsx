import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TurnControls } from './turn-controls';

describe('TurnControls', () => {
  it('WED-NEXT-BUTTON-03: clicking "Próximo turno" calls onAdvance', () => {
    const onAdvance = vi.fn();
    const { container } = render(<TurnControls onAdvance={onAdvance} pending={false} />);
    // WED-CSS-SCOPED-05: controls wrapper has .encuentros-init-controls
    expect(container.querySelector('.encuentros-init-controls')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /próximo turno/i }));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
