
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from './progress-bar';

function fillEl(container: HTMLElement): HTMLElement {
  // The track is the progressbar root; the fill is its first child div.
  const track = container.querySelector('[role="progressbar"]') as HTMLElement;
  return track.firstElementChild as HTMLElement;
}

describe('ProgressBar', () => {
  it('T1: renders role="progressbar" with aria-valuenow/min/max', () => {
    render(<ProgressBar value={3} max={10} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('10');
  });

  it('T2: fill width = round(value/max*100)%', () => {
    const { container } = render(<ProgressBar value={5} max={10} />);
    expect(fillEl(container).style.width).toBe('50%');
  });

  it('T3: clamps fill at 100% when value > max', () => {
    const { container } = render(<ProgressBar value={15} max={10} />);
    expect(fillEl(container).style.width).toBe('100%');
  });

  it('T4: max<=0 → 0% (no division by zero)', () => {
    const { container } = render(<ProgressBar value={5} max={0} />);
    expect(fillEl(container).style.width).toBe('0%');
  });

  it('T5: tone="arcane" → gradient fill class', () => {
    const { container } = render(<ProgressBar value={5} max={10} tone="arcane" />);
    expect(fillEl(container).className).toContain('from-arcane');
  });

  it('T6: default tone → bg-accent fill', () => {
    const { container } = render(<ProgressBar value={5} max={10} />);
    expect(fillEl(container).className).toContain('bg-accent');
  });

  it('T7: height="sm" → h-1; default (md) → h-1.5', () => {
    const { container: sm } = render(<ProgressBar value={5} max={10} height="sm" />);
    expect((sm.querySelector('[role="progressbar"]') as HTMLElement).className).toContain('h-1');
    const { container: md } = render(<ProgressBar value={5} max={10} />);
    expect((md.querySelector('[role="progressbar"]') as HTMLElement).className).toContain('h-1.5');
  });

  it('T8: trackClassName + className applied to the track element', () => {
    const { container } = render(
      <ProgressBar value={5} max={10} trackClassName="bg-white/10" className="mt-2" />,
    );
    const track = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(track.className).toContain('bg-white/10');
    expect(track.className).toContain('mt-2');
  });

  it('T9: ariaLabel applied to the progressbar element', () => {
    render(<ProgressBar value={5} max={10} ariaLabel="Experiencia" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).toBe('Experiencia');
  });
});
