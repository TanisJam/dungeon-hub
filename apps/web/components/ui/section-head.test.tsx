import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SectionHead } from './section-head';

describe('SectionHead', () => {
  // ── size="sm" (default — original SectionHead behaviour) ────────────────────

  describe('size="sm" (default)', () => {
    it('renders title', () => {
      render(<SectionHead title="Abilities" />);
      expect(screen.getByText('Abilities')).toBeTruthy();
    });

    it('renders num pill when num is provided', () => {
      const { container } = render(<SectionHead num="1" title="Choose Race" />);
      expect(container.querySelector('.rounded-pill')).toBeTruthy();
      expect(screen.getByText('1')).toBeTruthy();
    });

    it('renders meta when provided', () => {
      render(<SectionHead title="Spells" meta="3 slots" />);
      expect(screen.getByText('3 slots')).toBeTruthy();
    });

    it('does not render num pill when num is absent', () => {
      const { container } = render(<SectionHead title="Background" />);
      // No pill span — container should have no element with rounded-pill
      const pills = container.querySelectorAll('.rounded-pill');
      expect(pills.length).toBe(0);
    });

    it('wrapper has items-baseline and pb-1 (sm density)', () => {
      const { container } = render(<SectionHead title="Test" />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('items-baseline');
      expect(wrapper.className).toContain('pb-1');
    });

    it('sm pill uses px-2 py-0.5 text-xs', () => {
      const { container } = render(<SectionHead num="★" title="Special" />);
      const pill = container.querySelector('.rounded-pill') as HTMLElement;
      expect(pill.className).toContain('px-2');
      expect(pill.className).toContain('py-0.5');
      expect(pill.className).toContain('text-xs');
    });

    it('does not render description block when absent', () => {
      const { container } = render(<SectionHead title="Atributos" />);
      expect(container.querySelector('p')).toBeNull();
    });
  });

  // ── size="md" (NumberedSectionHead density) ─────────────────────────────────

  describe('size="md"', () => {
    it('renders title', () => {
      render(<SectionHead size="md" num="01" title="Atributos" />);
      expect(screen.getByText('Atributos')).toBeTruthy();
    });

    it('renders num pill', () => {
      const { container } = render(<SectionHead size="md" num="01" title="Atributos" />);
      expect(screen.getByText('01')).toBeTruthy();
      const pill = container.querySelector('.rounded-pill') as HTMLElement;
      expect(pill).toBeTruthy();
    });

    it('wrapper has mb-5 (md density outer wrapper)', () => {
      const { container } = render(<SectionHead size="md" num="01" title="Atributos" />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('mb-5');
    });

    it('inner row has items-center (not items-baseline)', () => {
      const { container } = render(<SectionHead size="md" num="01" title="Atributos" />);
      // The inner flex row is a child of the mb-5 wrapper
      const inner = container.firstChild?.firstChild as HTMLElement;
      expect(inner.className).toContain('items-center');
      expect(inner.className).not.toContain('items-baseline');
    });

    it('md pill uses h-6 min-w-6 px-1.5 text-[11px]', () => {
      const { container } = render(<SectionHead size="md" num="02" title="Clase" />);
      const pill = container.querySelector('.rounded-pill') as HTMLElement;
      expect(pill.className).toContain('h-6');
      expect(pill.className).toContain('min-w-6');
      expect(pill.className).toContain('px-1.5');
      expect(pill.className).toContain('text-[11px]');
    });

    it('renders description when provided', () => {
      render(
        <SectionHead
          size="md"
          num="01"
          title="Atributos"
          description="Asigná los seis atributos."
        />,
      );
      expect(screen.getByText('Asigná los seis atributos.')).toBeTruthy();
    });

    it('description renders in a <p> with text-sm text-ink-mute leading-snug mt-2', () => {
      const { container } = render(
        <SectionHead size="md" num="01" title="Atributos" description="Desc text" />,
      );
      const p = container.querySelector('p') as HTMLElement;
      expect(p).toBeTruthy();
      expect(p.className).toContain('text-sm');
      expect(p.className).toContain('text-ink-mute');
      expect(p.className).toContain('leading-snug');
      expect(p.className).toContain('mt-2');
    });

    it('does not render description block when absent', () => {
      const { container } = render(<SectionHead size="md" num="01" title="Atributos" />);
      expect(container.querySelector('p')).toBeNull();
    });

    it('renders meta when provided', () => {
      render(<SectionHead size="md" num="2" title="Class Features" meta="3 choices" />);
      expect(screen.getByText('3 choices')).toBeTruthy();
    });
  });

  // ── description on size="sm" ────────────────────────────────────────────────

  describe('description on size="sm"', () => {
    it('renders description below the row when provided', () => {
      render(<SectionHead title="Section" description="Extra info below." />);
      expect(screen.getByText('Extra info below.')).toBeTruthy();
    });
  });
});
