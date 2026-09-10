import { Choice, Owner, Phase, Piece, type GameState } from '@rps/core';
import { classifyGameTransition, gameStateFingerprint } from '../src/game-animation';

const baseState: GameState = {
  gameId: 'a1b2c3d4',
  phase: Phase.Active,
  isP1Turn: false,
  owners: Array(49).fill(Owner.None),
  pieces: Array(49).fill(Piece.Empty),
  live0: 14,
  live1: 14,
  attacker: Piece.Empty,
  defender: Piece.Empty,
  outcome: 0,
  playerChoice: Choice.None,
  tiePending: false,
  tieFrom: { x: 0, y: 0 },
  tieTo: { x: 0, y: 0 },
  p0: 'alice',
  p1: 'bob',
  winner: null,
};

test('classifies a board relocation as a move', () => {
  const previous = withBoard(baseState, 42, Owner.P0, Piece.Rock);
  const next = withBoard(previous, 42, Owner.None, Piece.Empty, 35, Owner.P0, Piece.Rock);
  expect(classifyGameTransition(previous, next)).toBe('move');
});

test('classifies casualties and ties as battles', () => {
  expect(classifyGameTransition(baseState, { ...baseState, live1: 13, outcome: 1 })).toBe('battle');
  expect(classifyGameTransition(baseState, { ...baseState, tiePending: true })).toBe('battle');
});

test('classifies non-board updates as phase transitions', () => {
  expect(classifyGameTransition(baseState, { ...baseState, isP1Turn: true })).toBe('phase');
});

test('fingerprint ignores object identity but tracks visible state', () => {
  expect(gameStateFingerprint({ ...baseState })).toBe(gameStateFingerprint(baseState));
  expect(gameStateFingerprint({ ...baseState, playerChoice: Choice.Paper })).not.toBe(gameStateFingerprint(baseState));
  expect(gameStateFingerprint({ ...baseState, tieTo: { x: 1, y: 2 } })).not.toBe(gameStateFingerprint(baseState));
});

function withBoard(
  state: GameState,
  index: number,
  owner: Owner,
  piece: Piece,
  secondIndex?: number,
  secondOwner?: Owner,
  secondPiece?: Piece,
): GameState {
  const owners = [...state.owners];
  const pieces = [...state.pieces];
  owners[index] = owner;
  pieces[index] = piece;
  if (secondIndex !== undefined && secondOwner !== undefined && secondPiece !== undefined) {
    owners[secondIndex] = secondOwner;
    pieces[secondIndex] = secondPiece;
  }
  return { ...state, owners, pieces };
}
