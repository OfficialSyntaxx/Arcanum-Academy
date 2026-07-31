import { describe, expect, it, vi } from 'vitest';
import { StateMachine } from '../fsm.js';
import { GamePhase, PHASE_TRANSITIONS } from '../phases.js';

function machine(initial: GamePhase = GamePhase.Boot) {
  return new StateMachine<GamePhase>({ initial, transitions: PHASE_TRANSITIONS });
}

describe('phase state machine', () => {
  it('allows declared transitions', () => {
    const fsm = machine();
    expect(fsm.transition(GamePhase.Loading, 'boot complete').ok).toBe(true);
    expect(fsm.current).toBe(GamePhase.Loading);
  });

  it('rejects undeclared transitions', () => {
    const fsm = machine();
    const result = fsm.transition(GamePhase.CardCombat, 'skip ahead');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('fsm.illegal_transition');
    expect(fsm.current).toBe(GamePhase.Boot);
  });

  it('forces duel exit through syncing so the server owns the result', () => {
    const fsm = machine(GamePhase.CardCombat);
    expect(fsm.can(GamePhase.WorldExploration)).toBe(false);
    expect(fsm.can(GamePhase.Syncing)).toBe(true);
  });

  it('honours a guard veto', () => {
    const fsm = new StateMachine<GamePhase>({
      initial: GamePhase.WorldExploration,
      transitions: PHASE_TRANSITIONS,
      guard: (context) => context.to !== GamePhase.Market,
    });
    const result = fsm.transition(GamePhase.Market);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('fsm.transition_vetoed');
  });

  it('fires enter and exit hooks in order', () => {
    const calls: string[] = [];
    const fsm = new StateMachine<GamePhase>({
      initial: GamePhase.Boot,
      transitions: PHASE_TRANSITIONS,
      onExit: (c) => calls.push(`exit:${c.from}`),
      onEnter: (c) => calls.push(`enter:${c.to}`),
    });
    fsm.transition(GamePhase.Loading);
    expect(calls).toEqual(['exit:BOOT', 'enter:LOADING']);
  });

  it('retains bounded transition history for crash reports', () => {
    const fsm = new StateMachine<GamePhase>({
      initial: GamePhase.WorldExploration,
      transitions: PHASE_TRANSITIONS,
      historyLimit: 2,
    });
    fsm.transition(GamePhase.Market);
    fsm.transition(GamePhase.WorldExploration);
    fsm.transition(GamePhase.DeckBuilding);
    expect(fsm.recentTransitions).toHaveLength(2);
    expect(fsm.recentTransitions.at(-1)?.to).toBe(GamePhase.DeckBuilding);
  });

  it('lets every phase reach Fault', () => {
    const unreachable = Object.values(GamePhase).filter(
      (phase) => phase !== GamePhase.Fault && !PHASE_TRANSITIONS[phase].includes(GamePhase.Fault),
    );
    expect(unreachable).toEqual([]);
  });

  it('never declares a transition to an unknown phase', () => {
    const known = new Set<string>(Object.values(GamePhase));
    for (const [from, targets] of Object.entries(PHASE_TRANSITIONS)) {
      for (const target of targets) {
        expect(known.has(target), `${from} -> ${target}`).toBe(true);
      }
    }
  });

  it('is not a mock: transition hooks observe the real current state', () => {
    const observed = vi.fn();
    const fsm = new StateMachine<GamePhase>({
      initial: GamePhase.Boot,
      transitions: PHASE_TRANSITIONS,
      onEnter: () => observed(fsm.current),
    });
    fsm.transition(GamePhase.Loading);
    expect(observed).toHaveBeenCalledWith(GamePhase.Loading);
  });
});
