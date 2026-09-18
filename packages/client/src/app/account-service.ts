import { readDocument, writeDocument, type KeyValueStore } from '../persistence/local-store.js';

const IDENTITY_KEY = 'identity';

interface StoredIdentity {
  readonly playerId?: string;
  readonly identityToken?: string;
}

interface AccountResponse {
  readonly playerId: string;
  readonly identityToken: string;
}

export class AccountService {
  constructor(
    private readonly storage: KeyValueStore,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async hasDeviceIdentity(): Promise<boolean> {
    const identity = await this.readIdentity();
    return typeof identity.identityToken === 'string';
  }

  async linkCurrentCharacter(): Promise<void> {
    const identity = await this.readIdentity();
    if (!identity.identityToken) throw new Error('Wait for the realm to finish connecting first.');
    const replacement = await this.request('link', { identityToken: identity.identityToken });
    await this.save(replacement);
  }

  async recoverCharacter(): Promise<void> {
    const replacement = await this.request('recover', {});
    await this.save(replacement);
  }

  private async readIdentity(): Promise<StoredIdentity> {
    const read = await readDocument(this.storage, IDENTITY_KEY);
    if (!read.ok) throw new Error('This browser could not read the local character token.');
    return (read.value ?? {}) as StoredIdentity;
  }

  private async request(action: 'link' | 'recover', body: Record<string, string>) {
    const response = await this.fetcher('/api/player-account', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    });
    const payload = (await response.json().catch(() => ({}))) as Partial<AccountResponse> & {
      error?: string;
    };
    if (!response.ok) {
      const messages: Record<string, string> = {
        authentication_required: 'Sign in before managing this character.',
        account_already_linked: 'That login or character is already linked to another account.',
        account_unavailable: 'No protected character is linked to this login yet.',
        proxy_not_configured: 'Account recovery is not configured on this deployment yet.',
      };
      throw new Error(
        messages[payload.error ?? ''] ?? 'The account request could not be completed.',
      );
    }
    if (typeof payload.playerId !== 'string' || typeof payload.identityToken !== 'string') {
      throw new Error('The account service returned an incomplete identity.');
    }
    return payload as AccountResponse;
  }

  private async save(identity: AccountResponse): Promise<void> {
    // A rotated account token deliberately discards the old session resume
    // token. Reloading performs a fresh proved handshake for this player.
    const written = await writeDocument(this.storage, IDENTITY_KEY, { ...identity });
    if (!written.ok) throw new Error('The recovered character could not be saved on this device.');
  }
}
