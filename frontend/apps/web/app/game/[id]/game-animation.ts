import { HEIGHT, Owner, Phase, Piece, toIdx, WIDTH, type GameState } from '@rps/core';

export type GameAnimationKind = 'move' | 'battle' | 'phase';
export type CombatAnimationPhase = 'prepare' | 'hold' | 'attack' | 'death' | 'settle';

export interface PieceMoveAnimation {
  from: { x: number; y: number };
  to: { x: number; y: number };
  owner: Owner;
  piece: Piece;
}

export interface CombatAnimation {
  resolution: 'pending' | 'resolved';
  isRepeatedTie?: boolean;
  from: { x: number; y: number };
  to: { x: number; y: number };
  attackerOwner: Owner;
  defenderOwner: Owner;
  attackerPiece: Piece;
  defenderPiece: Piece;
  winnerOwner: Owner | null;
  winnerPiece: Piece;
}

const RIVE_TIMELINE_FPS = 60;
const RIVE_JUMP_FORWARD_FRAMES = 45;
const RIVE_JUMP_HORIZONTAL_FRAMES = 38;
export const RIVE_JUMP_TRAVEL_DELAY_MS = 100;
export const REPEATED_TIE_REVEAL_MS = 900;
export const COMBAT_WINNER_SETTLE_MS = 320;

export function combatAttackDurationMs(piece: Piece) {
  if (piece === Piece.Rock) return 383;
  if (piece === Piece.Paper) return 500;
  if (piece === Piece.Scissors) return 966;
  return 400;
}

export function pieceMoveDurationMs(move: PieceMoveAnimation) {
  const frames = move.from.x === move.to.x ? RIVE_JUMP_FORWARD_FRAMES : RIVE_JUMP_HORIZONTAL_FRAMES;
  return frames / RIVE_TIMELINE_FPS * 1000;
}

export function gameStateFingerprint(state: GameState) {
  return JSON.stringify([state.gameId, state.phase, state.isP1Turn, state.live0, state.live1, state.attacker, state.defender, state.outcome, state.playerChoice, state.tiePending, state.tieRound ?? 0, state.tieFrom, state.tieTo, state.p0, state.p1, state.winner, state.owners, state.pieces]);
}

export function classifyGameTransition(previous: GameState, next: GameState): GameAnimationKind {
  const boardChanged = !arraysEqual(previous.owners, next.owners) || !arraysEqual(previous.pieces, next.pieces);
  const battleChanged = previous.tiePending !== next.tiePending
    || (previous.tieRound ?? 0) !== (next.tieRound ?? 0)
    || previous.live0 !== next.live0
    || previous.live1 !== next.live1
    || (boardChanged && next.defender !== Piece.Empty);
  if (battleChanged) return 'battle';
  if (boardChanged) return 'move';
  return 'phase';
}

export function getPieceMoveAnimation(previous: GameState, next: GameState): PieceMoveAnimation | null {
  if (previous.gameId !== next.gameId || previous.phase !== Phase.Active || previous.tiePending || next.tiePending) return null;
  const boardChanged = !arraysEqual(previous.owners, next.owners) || !arraysEqual(previous.pieces, next.pieces);
  const confirmed = previous.isP1Turn !== next.isP1Turn || (next.phase === Phase.Finished && boardChanged);
  if (!confirmed) return null;
  const owner = previous.isP1Turn ? Owner.P1 : Owner.P0;
  if (validCoordinate(next.tieFrom) && validCoordinate(next.tieTo) && adjacent(next.tieFrom, next.tieTo)) {
    const fromIndex = toIdx(next.tieFrom.x, next.tieFrom.y);
    if (previous.owners[fromIndex] === owner && previous.owners[fromIndex] !== next.owners[fromIndex]) {
      return { from: next.tieFrom, to: next.tieTo, owner, piece: previous.pieces[fromIndex] ?? Piece.Empty };
    }
  }
  const sources = previous.owners.map((value, index) => ({ value, index })).filter(({ value, index }) => value === owner && next.owners[index] !== owner);
  if (sources.length !== 1) return null;
  const index = sources[0]!.index;
  const from = { x: index % WIDTH, y: Math.floor(index / WIDTH) };
  const candidates = neighbours(from).filter(to => previous.owners[toIdx(to.x, to.y)] !== next.owners[toIdx(to.x, to.y)]);
  if (candidates.length !== 1) return null;
  return { from, to: candidates[0]!, owner, piece: previous.pieces[index] ?? Piece.Empty };
}

export function getCombatAnimation(previous: GameState, next: GameState): CombatAnimation | null {
  if (previous.gameId !== next.gameId || previous.phase !== Phase.Active) return null;
  const from = next.tieFrom;
  const to = next.tieTo;
  if (!validCoordinate(from) || !validCoordinate(to) || !adjacent(from, to)) return null;
  const attackerOwner = previous.owners[toIdx(from.x, from.y)] ?? Owner.None;
  const defenderOwner = previous.owners[toIdx(to.x, to.y)] ?? Owner.None;
  if (!isPlayer(attackerOwner) || !isPlayer(defenderOwner) || attackerOwner === defenderOwner || !isBattlePiece(next.attacker) || !isBattlePiece(next.defender)) return null;
  if (next.tiePending) {
    const isRepeatedTie = previous.tiePending && (next.tieRound ?? 0) > (previous.tieRound ?? 0);
    if ((!isRepeatedTie && previous.tiePending) || next.outcome !== 0 || next.attacker !== next.defender) return null;
    return { resolution: 'pending', ...(isRepeatedTie ? { isRepeatedTie: true } : {}), from, to, attackerOwner, defenderOwner, attackerPiece: next.attacker, defenderPiece: next.defender, winnerOwner: null, winnerPiece: Piece.Empty };
  }
  if (next.outcome === 0) return null;
  const attackerWon = next.outcome === 1;
  return { resolution: 'resolved', from, to, attackerOwner, defenderOwner, attackerPiece: next.attacker, defenderPiece: next.defender, winnerOwner: attackerWon ? attackerOwner : defenderOwner, winnerPiece: attackerWon ? next.attacker : next.defender };
}

function validCoordinate(value: { x: number; y: number }) { return Number.isInteger(value.x) && Number.isInteger(value.y) && value.x >= 0 && value.x < WIDTH && value.y >= 0 && value.y < HEIGHT; }
function adjacent(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1; }
function neighbours(from: { x: number; y: number }) { return [{ x: from.x + 1, y: from.y }, { x: from.x - 1, y: from.y }, { x: from.x, y: from.y + 1 }, { x: from.x, y: from.y - 1 }].filter(validCoordinate); }
function isPlayer(owner: Owner): owner is typeof Owner.P0 | typeof Owner.P1 { return owner === Owner.P0 || owner === Owner.P1; }
function isBattlePiece(piece: number): piece is Piece { return piece === Piece.Rock || piece === Piece.Paper || piece === Piece.Scissors; }
function arraysEqual(a: readonly number[], b: readonly number[]) { return a.length === b.length && a.every((value, index) => value === b[index]); }
