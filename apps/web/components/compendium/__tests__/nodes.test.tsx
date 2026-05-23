import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CompendiumEntries, EntryNodeRenderer } from '../index';

describe('string node', () => {
  it('wraps plain prose in a <p>', () => {
    const { container } = render(<EntryNodeRenderer entry="Hello world." />);
    expect(container.querySelector('p')?.textContent).toBe('Hello world.');
  });

  it('inline-renders {@b Bold} via the InlineRenderer (fallback for now)', () => {
    const { container } = render(<EntryNodeRenderer entry="A {@b Bold} word." />);
    // Phase A: no handlers registered → falls back to display text
    expect(container.textContent).toBe('A Bold word.');
  });
});

describe('entries node', () => {
  it('renders <section> with h4 label and nested children', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{
          type: 'entries',
          name: 'Darkvision',
          entries: ['You can see in the dark.'],
        }}
      />,
    );
    expect(container.querySelector('section')).not.toBeNull();
    expect(container.querySelector('h4')?.textContent).toBe('Darkvision.');
    expect(container.querySelector('p')?.textContent).toBe('You can see in the dark.');
  });

  it('omits the heading when name is absent', () => {
    const { container } = render(
      <EntryNodeRenderer entry={{ type: 'entries', entries: ['Body only.'] }} />,
    );
    expect(container.querySelector('h4')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe('Body only.');
  });
});

describe('list node', () => {
  it('renders a <ul> with one <li> per item', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'list', items: ['First', 'Second', 'Third'] }}
      />,
    );
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });
});

describe('item node', () => {
  it('renders <dt> with name and <dd> with body from `entries`', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{
          type: 'item',
          name: 'Bonus Action',
          entries: ['Take a bonus action on your turn.'],
        }}
      />,
    );
    expect(container.querySelector('dt')?.textContent).toBe('Bonus Action.');
    expect(container.querySelector('dd')?.textContent).toContain(
      'Take a bonus action on your turn.',
    );
  });

  it('supports the `entry` (singular) shape too', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'item', name: 'Foo', entry: 'Inline body.' }}
      />,
    );
    expect(container.querySelector('dd')?.textContent).toContain('Inline body.');
  });
});

describe('table node', () => {
  it('renders a table with column labels and rows', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{
          type: 'table',
          colLabels: ['Level', 'Prof. Bonus'],
          rows: [
            ['1', '+2'],
            ['5', '+3'],
          ],
        }}
      />,
    );
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    const headers = container.querySelectorAll('th');
    expect(headers).toHaveLength(2);
    expect(headers[0]?.textContent).toBe('Level');
    expect(headers[1]?.textContent).toBe('Prof. Bonus');
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelectorAll('td')).toHaveLength(2);
  });

  it('renders a caption when provided', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{
          type: 'table',
          caption: 'Wizard Progression',
          rows: [['1', 'Arcane Recovery']],
        }}
      />,
    );
    expect(container.querySelector('figcaption')?.textContent).toBe(
      'Wizard Progression',
    );
  });
});

describe('unknown node + edge cases', () => {
  it('renders span with name when type is unrecognised but name exists', () => {
    const { container } = render(
      <EntryNodeRenderer entry={{ type: 'notARealType', name: 'Foo' } as never} />,
    );
    expect(container.querySelector('span')?.textContent).toBe('Foo');
  });

  it('renders null for empty bare object without throwing', () => {
    const { container } = render(<EntryNodeRenderer entry={{} as never} />);
    expect(container.textContent).toBe('');
  });

  it('does not throw on null entry', () => {
    expect(() => render(<EntryNodeRenderer entry={null as never} />)).not.toThrow();
  });
});

describe('CompendiumEntries top-level', () => {
  it('renders nothing for empty array', () => {
    const { container } = render(<CompendiumEntries entries={[]} />);
    expect(container.textContent).toBe('');
  });

  it('renders nothing for null entries', () => {
    const { container } = render(<CompendiumEntries entries={null} />);
    expect(container.textContent).toBe('');
  });

  it('renders mixed prose + structured nodes without throwing', () => {
    const { container } = render(
      <CompendiumEntries
        entries={[
          'A leading sentence.',
          { type: 'list', items: ['Alpha', 'Beta'] },
          { type: 'entries', name: 'Aside', entries: ['Some prose.'] },
        ]}
      />,
    );
    expect(container.querySelector('p')?.textContent).toBe('A leading sentence.');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('h4')?.textContent).toBe('Aside.');
  });
});
