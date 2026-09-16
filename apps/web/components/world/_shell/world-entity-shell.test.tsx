/**
 * WorldEntityShell — deep-link initial selection tests (feed-entity-tap-to-open, MVP #3.10).
 *
 * NpcClientWrapper and FactionClientWrapper both delegate to this ONE shell, so this
 * is fixed once for both. Covers:
 *   - initialSelectionId matching a row in `items` seeds selectedRow/detailOpen via
 *     the same path as a real row tap (handleRowTap → onLoadDetail runs).
 *   - initialSelectionId matching NOTHING opens nothing (graceful miss, no error).
 *   - initialSelectionId omitted — unchanged default behavior (no sheet on mount).
 *
 * NOTE: afterEach(cleanup) is NOT declared here — it is already global via
 * apps/web/vitest.setup.ts. V3Sheet uses createPortal — assertions query document.body.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WorldEntityShell } from './world-entity-shell';

// WorldEntityShell calls useRouter().refresh() after mutations (not exercised here,
// but the hook must resolve without throwing).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

interface Row {
  id: string;
  name: string;
}

const rows: Row[] = [
  { id: 'row-1', name: 'Borin Piedrahonda' },
  { id: 'row-2', name: 'Los Cuervos' },
];

function renderShell(overrides: Partial<Parameters<typeof WorldEntityShell<Row, Row>>[0]> = {}) {
  const onSearch = vi.fn().mockResolvedValue({ rows, total: rows.length });

  return render(
    <WorldEntityShell<Row, Row>
      items={rows}
      total={rows.length}
      effectiveView="dm"
      searchPlaceholder="Buscar…"
      onSearch={onSearch}
      onLoadDetail={vi.fn().mockResolvedValue(null)}
      renderRow={(row) => <span>{row.name}</span>}
      renderDetail={(detail) => <span data-testid="detail-body">{detail.name}</span>}
      {...overrides}
    />,
  );
}

describe('WorldEntityShell — deep-link initial selection', () => {
  it('seeds the detail sheet when initialSelectionId matches a row in items', async () => {
    renderShell({
      initialSelectionId: 'row-1',
      onLoadDetail: vi.fn().mockResolvedValue({ id: 'row-1', name: 'Borin Piedrahonda' }),
    });

    // handleRowTap ran automatically on mount (same path a real row tap uses).
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByTestId('detail-body').textContent).toBe('Borin Piedrahonda');
    });
  });

  it('calls onLoadDetail with the matched row (real row-tap path, not a shortcut)', async () => {
    const onLoadDetail = vi.fn().mockResolvedValue({ id: 'row-2', name: 'Los Cuervos' });
    renderShell({ initialSelectionId: 'row-2', onLoadDetail });

    await waitFor(() => {
      expect(onLoadDetail).toHaveBeenCalledWith({ id: 'row-2', name: 'Los Cuervos' });
    });
  });

  it('opens NOTHING when initialSelectionId matches no row (graceful miss)', async () => {
    const onLoadDetail = vi.fn();
    renderShell({ initialSelectionId: 'does-not-exist', onLoadDetail });

    // Give any stray async work a tick, then assert nothing opened.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onLoadDetail).not.toHaveBeenCalled();
  });

  it('opens nothing when initialSelectionId is omitted (unchanged default behavior)', async () => {
    renderShell();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
