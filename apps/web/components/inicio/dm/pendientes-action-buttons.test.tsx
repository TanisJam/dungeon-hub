import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PendientesActionButtons } from './pendientes-action-buttons';
import { approveFichaFromInicio, rejectFichaFromInicio } from '@/app/inicio/actions';

vi.mock('@/app/inicio/actions', () => ({
  approveFichaFromInicio: vi.fn(),
  rejectFichaFromInicio: vi.fn(),
}));

const FICHA_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('PendientesActionButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T1: renders Aprobar, Ver ficha and Devolver labels', () => {
    render(<PendientesActionButtons fichaId={FICHA_ID} />);
    expect(screen.getByRole('button', { name: /aprobar/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /ver ficha/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /devolver/i })).toBeTruthy();
  });

  it('T2: click Aprobar calls approveFichaFromInicio with fichaId', async () => {
    vi.mocked(approveFichaFromInicio).mockResolvedValue({ ok: true });
    render(<PendientesActionButtons fichaId={FICHA_ID} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /aprobar/i }));
    });
    expect(approveFichaFromInicio).toHaveBeenCalledWith(FICHA_ID);
  });

  it('T3: click Devolver calls rejectFichaFromInicio with fichaId', async () => {
    vi.mocked(rejectFichaFromInicio).mockResolvedValue({ ok: true });
    render(<PendientesActionButtons fichaId={FICHA_ID} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /devolver/i }));
    });
    expect(rejectFichaFromInicio).toHaveBeenCalledWith(FICHA_ID);
  });

  it('T4: while transition pending, Aprobar+Devolver disabled, Ver ficha link is not aria-disabled', async () => {
    vi.mocked(approveFichaFromInicio).mockReturnValue(new Promise(() => {}));
    render(<PendientesActionButtons fichaId={FICHA_ID} />);
    const aprobar = screen.getByRole('button', { name: /aprobar/i }) as HTMLButtonElement;
    const devolver = screen.getByRole('button', { name: /devolver/i }) as HTMLButtonElement;
    const verFicha = screen.getByRole('link', { name: /ver ficha/i });
    await act(async () => {
      fireEvent.click(aprobar);
    });
    expect(aprobar.disabled).toBe(true);
    expect(devolver.disabled).toBe(true);
    expect(verFicha.getAttribute('aria-disabled')).toBeNull();
  });
});
