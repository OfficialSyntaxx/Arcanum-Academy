/**
 * The replay record.
 *
 * A duel is reproducible only against the content and balance it was played
 * under. Recording the seed and the commands alone would make a replay
 * silently wrong the first time a card is retuned: the log would still apply,
 * the numbers would differ, and nothing would say why.
 *
 * So a replay carries four things, and refuses to verify against a mismatch
 * rather than producing a confident wrong answer:
 *
 *   - the seed the shuffle came from
 *   - the command log, in order
 *   - the content schema version the cards were authored under
 *   - the tunables version the balance came from
 *
 * The final state hash is stored too, which is what makes verification a
 * comparison rather than an act of faith.
 */

import {
  err,
  failure,
  FailureCode,
  ok,
  type CardDefinitionId,
  type Failure,
  type Result,
} from '@arcanum/shared';
import { hashState } from '../hash.js';
import { replayDuel, type DuelCommand, type DuelSetup, type DuelState } from './duel.js';

export const REPLAY_FORMAT_VERSION = 1;

export interface DuelReplay {
  readonly formatVersion: number;
  readonly seed: string;
  readonly decks: readonly [readonly CardDefinitionId[], readonly CardDefinitionId[]];
  readonly commands: readonly DuelCommand[];
  readonly contentSchemaVersion: number;
  readonly tunablesVersion: number;
  /** Hash of the final state, so a verifier compares rather than trusts. */
  readonly finalStateHash: string;
}

export interface RecordReplayOptions {
  readonly setup: DuelSetup;
  readonly commands: readonly DuelCommand[];
  readonly contentSchemaVersion: number;
  readonly tunablesVersion: number;
}

export function recordReplay(options: RecordReplayOptions): Result<DuelReplay, Failure> {
  const final = replayDuel(options.setup, options.commands);
  if (!final.ok) return err(final.error);

  return ok({
    formatVersion: REPLAY_FORMAT_VERSION,
    seed: options.setup.seed,
    decks: options.setup.decks,
    commands: options.commands,
    contentSchemaVersion: options.contentSchemaVersion,
    tunablesVersion: options.tunablesVersion,
    finalStateHash: hashState(final.value),
  });
}

export interface VerifyReplayOptions {
  readonly replay: DuelReplay;
  readonly lookup: DuelSetup['lookup'];
  readonly tunables: DuelSetup['tunables'];
  readonly contentSchemaVersion: number;
  readonly tunablesVersion: number;
}

/**
 * Replays a record and checks it lands where it claims.
 *
 * Version mismatches are refused before the duel is run at all. Replaying a
 * duel under balance it was not played under produces a state that is wrong in
 * a way no hash comparison can explain, and "this replay is from an older
 * version" is a far more useful answer than "the hash did not match".
 */
export function verifyReplay(options: VerifyReplayOptions): Result<DuelState, Failure> {
  const { replay } = options;

  if (replay.formatVersion !== REPLAY_FORMAT_VERSION) {
    return err(
      failure(FailureCode.Migration, 'replay.format_mismatch', {
        detail: `replay is format ${replay.formatVersion}, this build reads ${REPLAY_FORMAT_VERSION}`,
      }),
    );
  }
  if (replay.contentSchemaVersion !== options.contentSchemaVersion) {
    return err(
      failure(FailureCode.Migration, 'replay.content_mismatch', {
        detail: `replay was played under content ${replay.contentSchemaVersion}, this build ships ${options.contentSchemaVersion}`,
      }),
    );
  }
  if (replay.tunablesVersion !== options.tunablesVersion) {
    return err(
      failure(FailureCode.Migration, 'replay.tunables_mismatch', {
        detail: `replay was played under tunables ${replay.tunablesVersion}, this build ships ${options.tunablesVersion}`,
      }),
    );
  }

  const final = replayDuel(
    {
      decks: replay.decks,
      seed: replay.seed,
      lookup: options.lookup,
      tunables: options.tunables,
    },
    replay.commands,
  );
  if (!final.ok) return err(final.error);

  const hash = hashState(final.value);
  if (hash !== replay.finalStateHash) {
    return err(
      failure(FailureCode.Desync, 'replay.hash_mismatch', {
        detail: `replay ends at ${hash}, record claims ${replay.finalStateHash}`,
        context: { expected: replay.finalStateHash, actual: hash },
      }),
    );
  }

  return ok(final.value);
}
