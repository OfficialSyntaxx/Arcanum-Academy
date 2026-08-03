import { CARD_CATALOG, SCHOOL_TABLE, STRINGS, type CardDefinitionId } from '@arcanum/shared';
import { useAppStore } from '../state/app-store.js';
import { LabelStrip } from './LabelStrip.js';

/**
 * The duel surface.
 *
 * Everything shown is the server's copy. There is no local resolution here at
 * all: a duel is the one place where predicting wrongly would show a player a
 * card resolving and then take it back, and a round trip is imperceptible next
 * to the time spent deciding what to cast.
 *
 * The opponent's hand is drawn as backs from a count. The client is never sent
 * the contents, so there is nothing here to leak even by accident.
 */

function schoolColour(definitionId: string): string {
  const definition = CARD_CATALOG.get(definitionId as CardDefinitionId);
  const school = definition === undefined ? undefined : SCHOOL_TABLE.get(definition.schoolId);
  return `var(${school?.colorToken ?? '--haze'})`;
}

function schoolGlyph(definitionId: string): string {
  const definition = CARD_CATALOG.get(definitionId as CardDefinitionId);
  const school = definition === undefined ? undefined : SCHOOL_TABLE.get(definition.schoolId);
  return school?.glyph ?? '·';
}

function DuelCard({
  definitionId,
  affordable,
  onCast,
}: {
  definitionId: string;
  affordable: boolean;
  onCast?: (() => void) | undefined;
}) {
  const definition = CARD_CATALOG.get(definitionId as CardDefinitionId);
  if (definition === undefined) return null;
  return (
    <button
      type="button"
      className="duel-card"
      style={{ borderColor: schoolColour(definitionId) }}
      disabled={!affordable || onCast === undefined}
      onClick={onCast}
    >
      <span className="duel-card__cost">{definition.cost}</span>
      <span className="duel-card__glyph" style={{ color: schoolColour(definitionId) }}>
        {schoolGlyph(definitionId)}
      </span>
      <span className="duel-card__name">{STRINGS.get(definition.nameKey)}</span>
      <span className="duel-card__text">{STRINGS.get(definition.textKey)}</span>
    </button>
  );
}

export function DuelScreen({
  onAct,
  onForfeit,
  onLeave,
}: {
  onAct: (command: string, handIndex?: number) => void;
  onForfeit: () => void;
  onLeave: () => void;
}) {
  const duel = useAppStore((state) => state.duel);
  if (duel === null) return null;

  const yourTurn = duel.active === 0 && duel.outcome === null;

  return (
    <div className="duel">
      <div className="panel duel__side duel__side--opponent">
        <LabelStrip title="Opponent" serial={`${duel.opponent.life} life`} />
        <div className="duel__stats">
          <span>{duel.opponent.handCount} in hand</span>
          <span>{duel.opponent.deck} in deck</span>
          {duel.opponent.ward > 0 && <span className="duel__ward">{duel.opponent.ward} ward</span>}
        </div>
        <div className="duel__board">
          {duel.opponent.board.map((slot, index) => (
            <DuelCard
              key={`${slot.definitionId}-${index}`}
              definitionId={slot.definitionId}
              affordable
            />
          ))}
        </div>
      </div>

      <div className="duel__log" role="log">
        {duel.log.slice(-6).map((line, index) => (
          <p key={`${line}-${index}`}>{line}</p>
        ))}
      </div>

      <div className="panel duel__side duel__side--you">
        <LabelStrip
          title={duel.outcome === null ? (yourTurn ? 'Your turn' : 'Waiting') : 'Duel over'}
          serial={`${duel.you.life} life · ${duel.you.resonance} resonance`}
          seal={duel.outcome?.winner === 0 ? 'gilt' : 'verdigris'}
        />

        {duel.outcome !== null ? (
          <p className="duel__outcome">
            {duel.outcome.winner === 0
              ? 'You win.'
              : duel.outcome.winner === null
                ? 'A draw.'
                : 'You lose.'}{' '}
            <span className="duel__reason">{duel.outcome.reason}</span>
          </p>
        ) : (
          <div className="duel__board">
            {duel.you.board.map((slot, index) => (
              <DuelCard
                key={`${slot.definitionId}-${index}`}
                definitionId={slot.definitionId}
                affordable
              />
            ))}
          </div>
        )}

        <div className="duel__hand">
          {duel.you.hand.map((definitionId, index) => {
            const definition = CARD_CATALOG.get(definitionId as CardDefinitionId);
            const affordable =
              yourTurn && definition !== undefined && definition.cost <= duel.you.resonance;
            return (
              <DuelCard
                key={`${definitionId}-${index}`}
                definitionId={definitionId}
                affordable={affordable}
                onCast={affordable ? () => onAct('PLAY_CARD', index) : undefined}
              />
            );
          })}
        </div>

        <div className="duel__actions">
          {duel.outcome === null ? (
            <>
              <button
                type="button"
                className="prompt__button"
                disabled={!yourTurn}
                onClick={() => onAct('END_TURN')}
              >
                End turn
              </button>
              <button type="button" className="prompt__button" onClick={onForfeit}>
                Forfeit
              </button>
            </>
          ) : (
            <button type="button" className="prompt__button" onClick={onLeave}>
              Leave
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
