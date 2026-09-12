import { HEIGHT, Owner, Phase, Piece, toIdx, WIDTH, type GameState } from '@rps/core';

export type GameAnimationKind = 'move' | 'battle' | 'phase';

export interface PieceMoveAnimation {
  from: { x: number; y: number };
  to: { x: number; y: number };
  owner: Owner;
  piece: Piece;
}

export interface CombatAnimation {
  from: { x: number; y: number };
  to: { x: number; y: number };
  attackerOwner: Owner;
  defenderOwner: Owner;
  attackerPiece: Piece;
  defenderPiece: Piece;
  winnerOwner: Owner;
  winnerPiece: Piece;
}

export type CombatAnimationPhase = 'prepare' | 'attack' | 'death';

export function combatAttackDurationMs(piece: Piece) {
  if (piece === Piece.Rock) return 383;
  if (piece === Piece.Paper) return 500;
  if (piece === Piece.Scissors) return 966;
  return 400;
}

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

export function isCompletedMoveTransition(previous: GameState, next: GameState): boolean {
  if (previous.gameId !== next.gameId || previous.phase !== Phase.Active) return false;

  const turnAdvanced = previous.isP1Turn !== next.isP1Turn;
  const boardChanged = !arraysEqual(previous.owners, next.owners) || !arraysEqual(previous.pieces, next.pieces);
  const gameFinishedByMove = next.phase === Phase.Finished && boardChanged;

  return turnAdvanced || gameFinishedByMove;
}

export function getPieceMoveAnimation(previous: GameState, next: GameState): PieceMoveAnimation | null {
  if (previous.gameId !== next.gameId || previous.phase !== Phase.Active || previous.tiePending) return null;
  const boardChanged = !arraysEqual(previous.owners, next.owners) || !arraysEqual(previous.pieces, next.pieces);
  const moveConfirmed = previous.isP1Turn !== next.isP1Turn
    || (!previous.tiePending && next.tiePending)
    || (next.phase === Phase.Finished && boardChanged);
  if (!moveConfirmed) return null;

  const attackerOwner = previous.isP1Turn ? Owner.P1 : Owner.P0;
  const explicitFrom = next.tieFrom;
  const explicitTo = next.tieTo;
  if (
    isBoardCoordinate(explicitFrom)
    && isBoardCoordinate(explicitTo)
    && isAdjacent(explicitFrom, explicitTo)
  ) {
    const fromIndex = toIdx(explicitFrom.x, explicitFrom.y);
    const sourceChanged = previous.owners[fromIndex] !== next.owners[fromIndex];
    if (previous.owners[fromIndex] === attackerOwner && (sourceChanged || next.tiePending)) {
      return {
        from: explicitFrom,
        to: explicitTo,
        owner: attackerOwner,
        piece: previous.pieces[fromIndex] ?? Piece.Empty,
      };
    }
  }

  const sourceIndexes = previous.owners
    .map((owner, index) => ({ owner, index }))
    .filter(({ owner, index }) => owner === attackerOwner && next.owners[index] !== owner)
    .map(({ index }) => index);
  if (sourceIndexes.length !== 1) return null;
  const fromIndex = sourceIndexes[0]!;
  const from = { x: fromIndex % WIDTH, y: Math.floor(fromIndex / WIDTH) };
  const destinationCandidates = adjacentCoordinates(from).filter(coordinate => {
    const index = toIdx(coordinate.x, coordinate.y);
    return previous.owners[index] !== next.owners[index] || previous.owners[index] === opponentOf(attackerOwner);
  });
  if (destinationCandidates.length !== 1) return null;
  return {
    from,
    to: destinationCandidates[0]!,
    owner: attackerOwner,
    piece: previous.pieces[fromIndex] ?? Piece.Empty,
  };
}

export function getCombatAnimation(previous: GameState, next: GameState): CombatAnimation | null {
  if (previous.gameId !== next.gameId || previous.phase !== Phase.Active || next.outcome === 0 || next.tiePending) return null;
  const from = next.tieFrom;
  const to = next.tieTo;
  if (!isBoardCoordinate(from) || !isBoardCoordinate(to) || !isAdjacent(from, to)) return null;

  const fromIndex = toIdx(from.x, from.y);
  const toIndex = toIdx(to.x, to.y);
  const attackerOwner = previous.owners[fromIndex];
  const defenderOwner = previous.owners[toIndex];
  if (
    (attackerOwner !== Owner.P0 && attackerOwner !== Owner.P1)
    || (defenderOwner !== Owner.P0 && defenderOwner !== Owner.P1)
    || attackerOwner === defenderOwner
    || !isBattlePiece(next.attacker)
    || !isBattlePiece(next.defender)
  ) return null;

  const attackerPiece = next.attacker;
  const defenderPiece = next.defender;
  const attackerWon = next.outcome === 1;
  return {
    from,
    to,
    attackerOwner,
    defenderOwner,
    attackerPiece,
    defenderPiece,
    winnerOwner: attackerWon ? attackerOwner : defenderOwner,
    winnerPiece: attackerWon ? attackerPiece : defenderPiece,
  };
}

function isBoardCoordinate(coordinate: { x: number; y: number }): boolean {
  return Number.isInteger(coordinate.x)
    && Number.isInteger(coordinate.y)
    && coordinate.x >= 0
    && coordinate.x < WIDTH
    && coordinate.y >= 0
    && coordinate.y < HEIGHT;
}

function isBattlePiece(piece: number): piece is Piece {
  return piece === Piece.Rock || piece === Piece.Paper || piece === Piece.Scissors;
}

function isAdjacent(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y) === 1;
}

function adjacentCoordinates(from: { x: number; y: number }) {
  return [
    { x: from.x + 1, y: from.y },
    { x: from.x - 1, y: from.y },
    { x: from.x, y: from.y + 1 },
    { x: from.x, y: from.y - 1 },
  ].filter(isBoardCoordinate);
}

function opponentOf(owner: Owner): Owner {
  return owner === Owner.P0 ? Owner.P1 : Owner.P0;
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
