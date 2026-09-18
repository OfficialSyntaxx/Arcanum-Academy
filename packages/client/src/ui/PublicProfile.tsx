import { useEffect, useState, type FormEvent } from 'react';
import { useAppStore } from '../state/app-store.js';
import { comparePublicProfile, type PublicSkillProgress } from './profile-comparison.js';
import { clearPublicProfileLink, publicProfileLink } from './public-profile-link.js';

interface Hiscore {
  readonly publicId: string;
  readonly rank: number;
  readonly displayName: string;
  readonly totalLevel: number;
  readonly totalXp: number;
  readonly combatLevel: number;
}

interface Detail extends Hiscore {
  readonly skills: readonly PublicSkillProgress[];
  readonly diaryHighlights: readonly string[];
  readonly discoveries: number;
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

function detailUrl(serverUrl: string, publicId: string): string | null {
  const base = profileUrl(serverUrl);
  return base ? `${base.replace('/hiscores', '')}/${encodeURIComponent(publicId)}` : null;
}

export function PublicProfile({
  serverUrl,
  onUpdate,
  onClose,
  initialPublicId = null,
}: {
  readonly serverUrl: string;
  readonly onUpdate: (displayName: string | null, isPublic: boolean) => void;
  readonly onClose: () => void;
  readonly initialPublicId?: string | null;
}) {
  const profile = useAppStore((state) => state.economy.profile);
  const ownSkills = useAppStore((state) => state.economy.skills);
  const ownDiscoveries = useAppStore((state) => state.economy.discoveries);
  const ownDiaryRewards = useAppStore((state) => state.economy.diaryRewards);
  const [name, setName] = useState(profile.displayName ?? '');
  const [publiclyListed, setPubliclyListed] = useState(profile.isPublic);
  const [scores, setScores] = useState<readonly Hiscore[]>([]);
  const [scoreStatus, setScoreStatus] = useState('Loading hiscores…');
  const [selected, setSelected] = useState<Detail | null>(null);

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

  useEffect(() => {
    if (initialPublicId === null) return;
    loadProfile(initialPublicId, false);
    // The pane mounts once per open. Re-fetching because local progression
    // changed would be wasteful and does not alter the selected public record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPublicId, serverUrl]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onUpdate(name.trim() || null, publiclyListed);
  }

  function loadProfile(publicId: string, updateAddress: boolean) {
    const url = detailUrl(serverUrl, publicId);
    if (!url) return;
    void fetch(url, { headers: { accept: 'application/json' } })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error('unavailable')),
      )
      .then((body: { profile?: Detail }) => {
        const selectedProfile = body.profile ?? null;
        setSelected(selectedProfile);
        if (selectedProfile !== null && updateAddress) setProfileAddress(selectedProfile.publicId);
      })
      .catch(() => setScoreStatus('That public profile is unavailable.'));
  }

  function view(publicId: string) {
    loadProfile(publicId, true);
  }

  function setProfileAddress(publicId: string) {
    const link = publicProfileLink(window.location.href, publicId);
    if (link) window.history.replaceState(null, '', link);
  }

  function clearProfileAddress() {
    const link = clearPublicProfileLink(window.location.href);
    if (link) window.history.replaceState(null, '', link);
  }

  async function shareSelected() {
    if (selected === null) return;
    const link = publicProfileLink(window.location.href, selected.publicId);
    if (!link) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${selected.displayName} · Alderfell`, url: link });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      }
    } catch {
      // Cancelling the iOS share sheet is an ordinary no-op.
    }
  }

  const comparison = selected
    ? comparePublicProfile(ownSkills, ownDiscoveries, ownDiaryRewards, selected)
    : null;

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
              <li key={score.publicId}>
                <button type="button" onClick={() => view(score.publicId)}>
                  #{score.rank} {score.displayName}
                </button>
                <span>
                  Lvl {score.totalLevel} · Combat {score.combatLevel} ·{' '}
                  {score.totalXp.toLocaleString()} XP
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {selected && (
        <section className="profile-panel__detail">
          <div className="profile-panel__detail-head">
            <h3>{selected.displayName}</h3>
            <div>
              <button type="button" onClick={shareSelected}>
                Share
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  clearProfileAddress();
                }}
                aria-label="Close comparison"
              >
                ×
              </button>
            </div>
          </div>
          <p>
            {selected.discoveries} discoveries · {selected.diaryHighlights.length} diary milestones
          </p>
          {comparison && (
            <div
              className="profile-panel__comparison"
              aria-label={`Compare with ${selected.displayName}`}
            >
              <p className="panel__eyebrow">Compare with you</p>
              <div className="profile-panel__compare-totals">
                <strong>You</strong>
                <strong>{selected.displayName}</strong>
                <span>Level {comparison.totals.ownLevel}</span>
                <span>Level {comparison.totals.otherLevel}</span>
                <span>{comparison.totals.ownXp.toLocaleString()} XP</span>
                <span>{comparison.totals.otherXp.toLocaleString()} XP</span>
                <span>{comparison.totals.ownDiscoveries} discoveries</span>
                <span>{comparison.totals.otherDiscoveries} discoveries</span>
                <span>{comparison.totals.ownDiaries} milestones</span>
                <span>{comparison.totals.otherDiaries} milestones</span>
              </div>
              <h4>Skills</h4>
              <ul className="profile-panel__compare-skills">
                {comparison.skills.map((skill) => (
                  <li key={skill.name}>
                    <span>{skill.name}</span>
                    <span>
                      L{skill.own.level} · {skill.own.xp.toLocaleString()} XP
                    </span>
                    <span>
                      L{skill.other.level} · {skill.other.xp.toLocaleString()} XP
                    </span>
                  </li>
                ))}
              </ul>
              {(comparison.ownDiaryTitles.length > 0 || selected.diaryHighlights.length > 0) && (
                <p className="profile-panel__compare-highlights">
                  Your milestones: {comparison.ownDiaryTitles.join(', ') || 'None'}
                  <br />
                  {selected.displayName}'s milestones:{' '}
                  {selected.diaryHighlights.join(', ') || 'None'}
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </aside>
  );
}
