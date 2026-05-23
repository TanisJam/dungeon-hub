import { notFound } from 'next/navigation';
import { CompendiumEntries } from '@/components/compendium';
import { Card } from '@/components/ui';
import { SAMPLES } from './samples';
import { TermHoverDemo } from './TermHoverDemo';

/**
 * Dev-only visual QA page for <CompendiumEntries>. Lists every supported node
 * type + tag family alongside hardcoded fixtures so we can scan all output in
 * one scroll. Blocked in production.
 */
export default function CompendiumPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">
          Compendium Entries Renderer — Preview
        </h1>
        <p className="mt-1 text-sm text-ink-mute">
          Dev-only QA page. Each card below renders a fixture exercising one or more
          AST node types or inline tags through the <code className="font-mono text-ink-soft">&lt;CompendiumEntries /&gt;</code> server component.
        </p>
      </header>

      {SAMPLES.map((sample, i) => (
        <section key={i} className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-ink">{sample.label}</h2>
          {sample.notes ? <p className="text-sm text-ink-mute italic">{sample.notes}</p> : null}
          <Card variant="surface" className="p-4">
            <CompendiumEntries entries={sample.entries} />
          </Card>
        </section>
      ))}

      {/* ------------------------------------------------------------------ */}
      {/* Term Hover Demo — MAURICIO: hover the underlined refs below to      */}
      {/* visually verify hover cards open with mocked content.               */}
      {/* Kinds covered: spell, condition, item, creature, race, background   */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-ink">Term Hover Demo</h2>
        <p className="text-sm text-ink-mute italic">
          Hover (or tab-focus) the highlighted inline terms to see the mock HoverCard.
          No real API credentials required — all responses come from static fixtures.
          Kinds demonstrated: spell, creature, condition, item, race, background.
        </p>
        <Card variant="surface" className="p-4">
          <TermHoverDemo />
        </Card>
      </section>
    </main>
  );
}
