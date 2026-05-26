/**
 * CampaignsSection — DM "Master" pill link to /worlds/[id].
 *
 * SDD dm-session-panel (spec #857) — REQ-DWL-MASTER-CLICKABLE.
 *   - GM rows wrap the pill in a <Link href="/worlds/<worldId>">
 *   - Player rows render the pill without a /worlds link
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { CampaignsSection } from './_campaigns-section';

const W1 = '11111111-1111-1111-1111-111111111111';
const W2 = '22222222-2222-2222-2222-222222222222';
const USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function gmCampaign(id: string, worldId: string, name: string) {
  return { id, name, gmUserId: USER, worldId, memberRole: 'gm' as const };
}

function playerCampaign(id: string, worldId: string, name: string) {
  return { id, name, gmUserId: OTHER, worldId, memberRole: 'player' as const };
}

describe('CampaignsSection — REQ-DWL-MASTER-CLICKABLE', () => {
  it('wraps the DM pill in a Link to /worlds/<worldId> for GM rows', () => {
    const { container } = render(
      <CampaignsSection
        campaigns={[gmCampaign('cmp-1', W1, 'Eldoria')]}
        currentUserId={USER}
      />,
    );
    const link = container.querySelector(`a[href='/worlds/${W1}']`);
    expect(link).not.toBeNull();
    // The pill text "DM" lives inside that link.
    expect(link?.textContent).toContain('DM');
  });

  it('does NOT wrap the Jugador pill in a /worlds link for player rows', () => {
    const { container } = render(
      <CampaignsSection
        campaigns={[playerCampaign('cmp-2', W2, 'Forgotten Realms')]}
        currentUserId={USER}
      />,
    );
    expect(container.querySelector(`a[href='/worlds/${W2}']`)).toBeNull();
    // The "Jugador" label is still rendered (just inert).
    expect(screen.getByText('Jugador')).toBeTruthy();
  });

  it('mixed dashboard: gm row links, player row does not', () => {
    const { container } = render(
      <CampaignsSection
        campaigns={[
          gmCampaign('cmp-1', W1, 'Eldoria'),
          playerCampaign('cmp-2', W2, 'Forgotten Realms'),
        ]}
        currentUserId={USER}
      />,
    );
    // gm row → link to W1
    expect(container.querySelector(`a[href='/worlds/${W1}']`)).not.toBeNull();
    // player row → no link to W2
    expect(container.querySelector(`a[href='/worlds/${W2}']`)).toBeNull();
  });

  it('GM Link has min-h-[44px] tap target (mobile-first)', () => {
    const { container } = render(
      <CampaignsSection
        campaigns={[gmCampaign('cmp-1', W1, 'Eldoria')]}
        currentUserId={USER}
      />,
    );
    const link = container.querySelector(`a[href='/worlds/${W1}']`);
    expect(link?.className).toContain('min-h-[44px]');
  });

  it('GM Link carries an aria-label that names the campaign', () => {
    render(
      <CampaignsSection
        campaigns={[gmCampaign('cmp-1', W1, 'Eldoria')]}
        currentUserId={USER}
      />,
    );
    expect(
      screen.getByRole('link', { name: /Eldoria/ }),
    ).toBeTruthy();
  });
});
