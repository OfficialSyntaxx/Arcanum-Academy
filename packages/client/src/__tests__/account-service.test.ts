import { describe, expect, it, vi } from 'vitest';
import { AccountService } from '../app/account-service.js';
import { MemoryStore, readDocument, writeDocument } from '../persistence/local-store.js';

describe('AccountService', () => {
  it('links the current token and persists only the rotated identity', async () => {
    const storage = new MemoryStore();
    await writeDocument(storage, 'identity', {
      playerId: 'old-player',
      identityToken: 'old-token',
      resumeToken: 'old-resume',
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          playerId: 'old-player',
          identityToken: 'new-token',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await new AccountService(storage, fetcher).linkCurrentCharacter();
    expect(fetcher).toHaveBeenCalledWith(
      '/api/player-account',
      expect.objectContaining({
        body: JSON.stringify({ action: 'link', identityToken: 'old-token' }),
      }),
    );
    const saved = await readDocument(storage, 'identity');
    expect(saved.ok && saved.value).toMatchObject({
      playerId: 'old-player',
      identityToken: 'new-token',
    });
    expect(saved.ok && saved.value).not.toHaveProperty('resumeToken');
  });

  it('replaces a disposable local identity during recovery', async () => {
    const storage = new MemoryStore();
    await writeDocument(storage, 'identity', {
      playerId: 'new-empty-player',
      identityToken: 'temp',
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          playerId: 'original-player',
          identityToken: 'recovered-token',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await new AccountService(storage, fetcher).recoverCharacter();
    const saved = await readDocument(storage, 'identity');
    expect(saved.ok && saved.value).toMatchObject({
      playerId: 'original-player',
      identityToken: 'recovered-token',
    });
  });
});
