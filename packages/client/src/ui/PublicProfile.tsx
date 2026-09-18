import { useEffect, useState, type FormEvent } from 'react';
import { useAppStore } from '../state/app-store.js';

interface Hiscore {
  readonly rank: number;
  readonly displayName: string;
  readonly totalLevel: number;
  readonly totalXp: number;
  readonly combatLevel: number;
}

function profileUrl(serverUrl: string): string | null {
  try {
    const url = new URL(serverUrl);
    url.protocol =
      url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : url.protocol;
    url.pathname = '/profiles/hiscores';
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function PublicProfile({
  serverUrl,
  onUpdate,
  onClose,
}: {
  readonly serverUrl: string;
  readonly onUpdate: (displayName: string | null, isPublic: boolean) => void;
  readonly onClose: () => void;
}) {
  const profile = useAppStore((state) => state.economy.profile);
  const [name, setName] = useState(profile.displayName ?? '');
  const [publiclyListed, setPubliclyListed] = useState(profile.isPublic);
  const [scores, setScores] = useState<readonly Hiscore[]>([]);
  const [scoreStatus, setScoreStatus] = useState('Loading hiscores…');

  useEffect(() => {
    const url = profileUrl(serverUrl);
    if (!url) return setScoreStatus('Hiscores are unavailable in this local build.');
    void fetch(url, { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        return response.json() as Promise<{ hiscores?: readonly Hiscore[] }>;
      })
      .then((body) => {
        setScores(body.hiscores ?? []);
        setScoreStatus(body.hiscores?.length ? '' : 'No public adventurers yet.');
      })
      .catch(() => setScoreStatus('Hiscores are temporarily unavailable.'));
  }, [serverUrl]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onUpdate(name.trim() || null, publiclyListed);
  }

  return (
    <aside className="panel profile-panel" aria-label="Public profile and hiscores">
      <div className="panel__head">
        <h2>Profile</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p>
        Your character is private by default. Only an opted-in name, total level, total XP, combat
        level, and last update are public.
      </p>
      <form onSubmit={submit}>
        <label>
          Display name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            placeholder="Alderfell name"
          />
        </label>
        <label className="profile-panel__check">
          <input
            type="checkbox"
            checked={publiclyListed}
            onChange={(event) => setPubliclyListed(event.target.checked)}
          />{' '}
          List this character publicly
        </label>
        <button type="submit" disabled={publiclyListed && name.trim().length < 3}>
          Save profile
        </button>
      </form>
      <section>
        <h3>Hiscores</h3>
        {scoreStatus ? (
          <p>{scoreStatus}</p>
        ) : (
          <ol className="profile-panel__scores">
            {scores.map((score) => (
              <li key={`${score.rank}-${score.displayName}`}>
                <strong>
                  #{score.rank} {score.displayName}
                </strong>
                <span>
                  Lvl {score.totalLevel} · Combat {score.combatLevel} ·{' '}
                  {score.totalXp.toLocaleString()} XP
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
