import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test.
// ---------------------------------------------------------------------------

vi.mock('../api-client.js', () => {
  const LinkRequiredError = class extends Error {
    constructor(readonly body: string) {
      super('Discord user not linked');
    }
  };
  const api = { postAs: vi.fn() };
  return { api, LinkRequiredError, ApiError: class extends Error {} };
});

// ---------------------------------------------------------------------------
// Import under test AFTER mocks are declared
// ---------------------------------------------------------------------------

import { execute } from './unlink.js';
import { api, LinkRequiredError } from '../api-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInteraction(overrides: Partial<ChatInputCommandInteraction> = {}): ChatInputCommandInteraction {
  return {
    user: { id: 'discord-user-456' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/unlink command', () => {
  it('UNLINK-1: linked user → calls revoke endpoint, replies with success', async () => {
    (api.postAs as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      previousDiscordId: 'discord-user-456',
      previousDiscordUsername: 'someuser',
    });

    const interaction = makeInteraction();
    await execute(interaction);

    // Ephemeral defer.
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    // Calls the revoke endpoint via postAs with the user's discord id.
    expect(api.postAs).toHaveBeenCalledWith('discord-user-456', '/api/v1/auth/link/revoke');
    // Reply confirms unlink + hints /link.
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    const reply = (interaction.editReply as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(reply.content).toContain('Cuenta desvinculada');
    expect(reply.content).toContain('/link');
  });

  it('UNLINK-2: unlinked user (LinkRequiredError) → friendly hint, no error', async () => {
    (api.postAs as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new LinkRequiredError('DISCORD_USER_NOT_LINKED'),
    );

    const interaction = makeInteraction();
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    const reply = (interaction.editReply as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(reply.content).toContain('no está vinculado');
    expect(reply.content).toContain('/link');
  });

  it('UNLINK-3: generic API error → error reply', async () => {
    (api.postAs as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network unreachable'),
    );

    const interaction = makeInteraction();
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    const reply = (interaction.editReply as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(reply.content).toContain('Error');
    expect(reply.content).toContain('Network unreachable');
  });
});
