
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCell } from './stat-cell';

describe('StatCell', () => {
  it('T1: renders label text and value', () => {
    render(<StatCell label="FUE" value={15} />);
    expect(screen.getByText('FUE')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
  });

  it('T2: size="compact" → value span has text-lg; default → text-2xl', () => {
    const { rerender, container } = render(<StatCell label="FUE" value={15} size="compact" />);
    const compactValue = container.querySelector('span[data-stat-value]');
    expect(compactValue?.className).toContain('text-lg');
    expect(compactValue?.className).not.toContain('text-2xl');

    rerender(<StatCell label="FUE" value={15} />);
    const defaultValue = container.querySelector('span[data-stat-value]');
    expect(defaultValue?.className).toContain('text-2xl');
    expect(defaultValue?.className).not.toContain('text-lg');
  });

  it('T3: surface="paper" → has bg-paper-soft and NOT border-line; default surface → has border-line', () => {
    const { rerender, container } = render(<StatCell label="FUE" value={15} surface="paper" />);
    const paperEl = container.firstElementChild;
    expect(paperEl?.className).toContain('bg-paper-soft');
    expect(paperEl?.className).not.toContain('border-line');

    rerender(<StatCell label="FUE" value={15} />);
    const surfaceEl = container.firstElementChild;
    expect(surfaceEl?.className).toContain('border-line');
  });

  it('T4: value={null} → renders "—" and container has border-dashed', () => {
    const { container } = render(<StatCell label="FUE" value={null} />);
    expect(screen.getByText('—')).toBeTruthy();
    const el = container.firstElementChild;
    expect(el?.className).toContain('border-dashed');
  });

  it('T5: onClick provided → renders a <button>; without onClick → no button role', () => {
    const { rerender } = render(<StatCell label="FUE" value={15} onClick={() => {}} />);
    expect(screen.getByRole('button')).toBeTruthy();

    rerender(<StatCell label="FUE" value={15} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('T6: selected → className contains border-accent-deep', () => {
    const { container } = render(<StatCell label="FUE" value={15} selected />);
    expect(container.firstElementChild?.className).toContain('border-accent-deep');
  });

  it('T7: accent="teal" → has class ficha-vital-ac AND still has border-line; accent="peach" → has ficha-vital-hp and NOT bg-surface', () => {
    const { rerender, container } = render(<StatCell label="FUE" value={15} accent="teal" />);
    const tealEl = container.firstElementChild;
    expect(tealEl?.className).toContain('ficha-vital-ac');
    expect(tealEl?.className).toContain('border-line');

    rerender(<StatCell label="FUE" value={15} accent="peach" />);
    const peachEl = container.firstElementChild;
    expect(peachEl?.className).toContain('ficha-vital-hp');
    expect(peachEl?.className).not.toContain('bg-surface');
  });

  it('T8: string sub renders in a span; node sub renders the node', () => {
    const { rerender, container } = render(<StatCell label="FUE" value={15} sub="+2 mod" />);
    const subSpan = container.querySelector('[data-stat-sub]');
    expect(subSpan?.tagName).toBe('SPAN');
    expect(subSpan?.textContent).toBe('+2 mod');

    rerender(
      <StatCell
        label="FUE"
        value={15}
        sub={<span data-testid="node-sub" />}
      />,
    );
    expect(screen.getByTestId('node-sub')).toBeTruthy();
  });

  it('T9: footer node renders', () => {
    render(
      <StatCell
        label="FUE"
        value={15}
        footer={<div data-testid="footer-slot">bar</div>}
      />,
    );
    expect(screen.getByTestId('footer-slot')).toBeTruthy();
  });
});
