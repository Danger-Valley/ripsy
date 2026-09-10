import { Piece, type GameState } from '@rps/core';

export type GameAnimationKind = 'move' | 'battle' | 'phase';

export function gameStateFingerprint(state: GameState): string {
  return JSON.stringify([
    state.gameId,
    state.phase,
    state.isP1Turn,
    state.live0,
    state.live1,
    state.attacker,
    state.defender,
    state.outcome,
    state.playerChoice,
    state.tiePending,
    state.tieFrom.x,
    state.tieFrom.y,
    state.tieTo.x,
    state.tieTo.y,
    state.p0,
    state.p1,
    state.winner,
    state.owners,
    state.pieces,
  ]);
}

export function classifyGameTransition(previous: GameState, next: GameState): GameAnimationKind {
  const boardChanged = !arraysEqual(previous.owners, next.owners) || !arraysEqual(previous.pieces, next.pieces);
  const battleChanged = previous.tiePending !== next.tiePending
    || previous.live0 !== next.live0
    || previous.live1 !== next.live1
    || (boardChanged && next.defender !== Piece.Empty);

  if (battleChanged) return 'battle';
  if (boardChanged) return 'move';
  return 'phase';
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
