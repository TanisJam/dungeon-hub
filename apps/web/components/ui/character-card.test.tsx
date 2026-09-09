/**
 * Tests for CharacterCard atom (C3 — entity-cards).
 *
 * CharacterCard unifies personaje-card and active-character-card:
 *   - Outer wrapper: flex overflow-hidden rounded-md border bg-surface + className
 *   - Inside: <Link href={href} flex flex-1>
 *       <CharacterPortrait name={name} className={portraitClassName} />
 *       <div>{children}</div>  — content column slot
 *       <div aria-hidden>›</div>  — trailing chevron
 *   - Optional {action} slot outside the Link (e.g. SetActiveCharacterButton)
 *
 * REQ-C3-01: renders portrait initial derived from name prop
 * REQ-C3-02: renders children in the content column
 * REQ-C3-03: renders chevron ›
 * REQ-C3-04: Link has correct href
 * REQ-C3-05: className applied to root wrapper div
 * REQ-C3-06: portraitClassName forwarded to CharacterPortrait
 * REQ-C3-07: action slot renders outside the Link
 * REQ-C3-08: no action slot renders when action not provided
 * REQ-C3-09: root wrapper has data-character-card attribute
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterCard } from './character-card';

describe('CharacterCard', () => {
  it('REQ-C3-01: renders portrait initial derived from name prop', () => {
    render(
      <CharacterCard href="/characters/1" name="Brann Cuervosombrío">
        <span>content</span>
      </CharacterCard>,
    );
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('REQ-C3-02: renders children in the content column', () => {
    render(
      <CharacterCard href="/characters/1" name="Brann">
        <span data-testid="content-child">My Content</span>
      </CharacterCard>,
    );
    expect(screen.getByTestId('content-child')).toBeTruthy();
    expect(screen.getByText('My Content')).toBeTruthy();
  });

  it('REQ-C3-03: renders chevron ›', () => {
    render(
      <CharacterCard href="/characters/1" name="Brann">
        <span>content</span>
      </CharacterCard>,
    );
    expect(screen.getByText('›')).toBeTruthy();
  });

  it('REQ-C3-04: Link has correct href', () => {
    render(
      <CharacterCard href="/characters/abc-123" name="Brann">
        <span>content</span>
      </CharacterCard>,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/characters/abc-123');
  });

  it('REQ-C3-05: className is applied to root wrapper div', () => {
    const { container } = render(
      <CharacterCard href="/characters/1" name="Brann" className="border-accent ring-1 ring-accent/30">
        <span>content</span>
      </CharacterCard>,
    );
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('border-accent');
    expect(wrapper?.className).toContain('ring-1');
    expect(wrapper?.className).toContain('ring-accent/30');
  });

  it('REQ-C3-05b: default className has border-line when no className provided', () => {
    const { container } = render(
      <CharacterCard href="/characters/1" name="Brann">
        <span>content</span>
      </CharacterCard>,
    );
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('border-line');
  });

  it('REQ-C3-06: portraitClassName forwarded to CharacterPortrait', () => {
    const { container } = render(
      <CharacterCard href="/characters/1" name="Brann" portraitClassName="border-r border-accent">
        <span>content</span>
      </CharacterCard>,
    );
    // The portrait div has data-portrait-size attribute (from CharacterPortrait)
    const portrait = container.querySelector('[data-portrait-size]');
    expect(portrait?.className).toContain('border-r');
    expect(portrait?.className).toContain('border-accent');
  });

  it('REQ-C3-07: action slot renders outside the Link when provided', () => {
    render(
      <CharacterCard
        href="/characters/1"
        name="Brann"
        action={<button type="button" data-testid="action-btn">Action</button>}
      >
        <span>content</span>
      </CharacterCard>,
    );
    const link = screen.getByRole('link');
    const actionBtn = screen.getByTestId('action-btn');
    // action button must NOT be inside the link
    expect(link.contains(actionBtn)).toBe(false);
  });

  it('REQ-C3-08: no action element when action not provided', () => {
    const { container } = render(
      <CharacterCard href="/characters/1" name="Brann">
        <span>content</span>
      </CharacterCard>,
    );
    // Should have exactly one child: the Link
    const wrapper = container.firstElementChild;
    expect(wrapper?.childElementCount).toBe(1);
  });

  it('REQ-C3-09: root wrapper has data-character-card attribute', () => {
    const { container } = render(
      <CharacterCard href="/characters/1" name="Brann">
        <span>content</span>
      </CharacterCard>,
    );
    const wrapper = container.firstElementChild;
    expect(wrapper?.hasAttribute('data-character-card')).toBe(true);
  });
});
