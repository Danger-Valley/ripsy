import { Choice, Owner, Phase, Piece, type GameState } from '@rps/core';
import {
  classifyGameTransition,
  combatAttackDurationMs,
  gameStateFingerprint,
  getCombatAnimation,
  getPieceMoveAnimation,
  isCompletedMoveTransition,
  pieceMoveDurationMs,
} from '../src/game-animation';

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
  expect(classifyGameTransition(baseState, { ...baseState, tieRound: 1 })).toBe('battle');
});

test('classifies non-board updates as phase transitions', () => {
  expect(classifyGameTransition(baseState, { ...baseState, isP1Turn: true })).toBe('phase');
});

test('fingerprint ignores object identity but tracks visible state', () => {
  expect(gameStateFingerprint({ ...baseState })).toBe(gameStateFingerprint(baseState));
  expect(gameStateFingerprint({ ...baseState, playerChoice: Choice.Paper })).not.toBe(gameStateFingerprint(baseState));
  expect(gameStateFingerprint({ ...baseState, tieTo: { x: 1, y: 2 } })).not.toBe(gameStateFingerprint(baseState));
  expect(gameStateFingerprint({ ...baseState, tieRound: 1 })).not.toBe(gameStateFingerprint(baseState));
});

test('detects a confirmed move when the turn advances', () => {
  expect(isCompletedMoveTransition(baseState, { ...baseState, isP1Turn: true })).toBe(true);
});

test('detects a move that finishes the game without advancing the turn', () => {
  const pieces = [...baseState.pieces];
  pieces[0] = Piece.Rock;
  expect(isCompletedMoveTransition(baseState, { ...baseState, phase: Phase.Finished, pieces })).toBe(true);
});

test('does not treat initial state, duplicate state, or tie resolution as another move', () => {
  expect(isCompletedMoveTransition({ ...baseState, phase: Phase.LineupP1Set }, baseState)).toBe(false);
  expect(isCompletedMoveTransition(baseState, { ...baseState })).toBe(false);
  expect(isCompletedMoveTransition(
    { ...baseState, tiePending: true },
    { ...baseState, tiePending: false, outcome: 1 },
  )).toBe(false);
});

test('does not move a figure into a tied battle before weapon choices resolve it', () => {
  const withAttacker = withBoard(baseState, 35, Owner.P0, Piece.Rock);
  const previous = withBoard(withAttacker, 28, Owner.P1, Piece.Empty);
  const tied = {
    ...previous,
    attacker: Piece.Rock,
    defender: Piece.Rock,
    tiePending: true,
    tieFrom: { x: 0, y: 5 },
    tieTo: { x: 0, y: 4 },
  };

  expect(getPieceMoveAnimation(previous, tied)).toBeNull();
});

test('extracts the exact jump coordinates from a confirmed move', () => {
  const previous = withBoard(baseState, 35, Owner.P0, Piece.Rock);
  const next = withBoard(
    { ...previous, isP1Turn: true, tieFrom: { x: 0, y: 5 }, tieTo: { x: 0, y: 4 } },
    35,
    Owner.None,
    Piece.Empty,
    28,
    Owner.P0,
    Piece.Rock,
  );

  expect(getPieceMoveAnimation(previous, next)).toEqual({
    from: { x: 0, y: 5 },
    to: { x: 0, y: 4 },
    owner: Owner.P0,
    piece: Piece.Rock,
  });
});

test('uses recorded coordinates when an attacking piece loses and only the source changes', () => {
  const withAttacker = withBoard(baseState, 7, Owner.P0, Piece.Scissors);
  const previous = withBoard(withAttacker, 0, Owner.P1, Piece.Empty);
  const next = withBoard(
    { ...previous, isP1Turn: true, tieFrom: { x: 0, y: 1 }, tieTo: { x: 0, y: 0 } },
    7,
    Owner.None,
    Piece.Empty,
  );

  expect(getPieceMoveAnimation(previous, next)).toMatchObject({
    from: { x: 0, y: 1 },
    to: { x: 0, y: 0 },
    owner: Owner.P0,
  });
});

test('extracts both fighters and the winner from a resolved battle', () => {
  const withAttacker = withBoard(baseState, 35, Owner.P0, Piece.Rock);
  const previous = withBoard(withAttacker, 28, Owner.P1, Piece.Empty);
  const next = withBoard(
    {
      ...previous,
      attacker: Piece.Rock,
      defender: Piece.Scissors,
      outcome: 1,
      isP1Turn: true,
      tieFrom: { x: 0, y: 5 },
      tieTo: { x: 0, y: 4 },
    },
    35,
    Owner.None,
    Piece.Empty,
    28,
    Owner.P0,
    Piece.Rock,
  );

  expect(getCombatAnimation(previous, next)).toEqual({
    resolution: 'resolved',
    from: { x: 0, y: 5 },
    to: { x: 0, y: 4 },
    attackerOwner: Owner.P0,
    defenderOwner: Owner.P1,
    attackerPiece: Piece.Rock,
    defenderPiece: Piece.Scissors,
    winnerOwner: Owner.P0,
    winnerPiece: Piece.Rock,
  });
});

test('uses the defender as the combat winner when the attack loses', () => {
  const withAttacker = withBoard(baseState, 35, Owner.P0, Piece.Rock);
  const previous = withBoard(withAttacker, 28, Owner.P1, Piece.Empty);
  const next = {
    ...previous,
    attacker: Piece.Rock,
    defender: Piece.Paper,
    outcome: -1,
    isP1Turn: true,
    tieFrom: { x: 0, y: 5 },
    tieTo: { x: 0, y: 4 },
  };

  expect(getCombatAnimation(previous, next)).toMatchObject({
    winnerOwner: Owner.P1,
    winnerPiece: Piece.Paper,
  });
});

test('creates a held combat scene before asking for tied battle choices', () => {
  const withAttacker = withBoard(baseState, 35, Owner.P0, Piece.Rock);
  const previous = withBoard(withAttacker, 28, Owner.P1, Piece.Empty);
  const tied = {
    ...previous,
    attacker: Piece.Rock,
    defender: Piece.Rock,
    outcome: 0,
    tiePending: true,
    tieFrom: { x: 0, y: 5 },
    tieTo: { x: 0, y: 4 },
  };
  expect(getCombatAnimation(previous, tied)).toEqual({
    resolution: 'pending',
    from: { x: 0, y: 5 },
    to: { x: 0, y: 4 },
    attackerOwner: Owner.P0,
    defenderOwner: Owner.P1,
    attackerPiece: Piece.Rock,
    defenderPiece: Piece.Rock,
    winnerOwner: null,
    winnerPiece: Piece.Empty,
  });

  const repeatedTie = {
    ...tied,
    attacker: Piece.Paper,
    defender: Piece.Paper,
    tieRound: 1,
  };
  expect(getCombatAnimation(tied, repeatedTie)).toMatchObject({
    resolution: 'pending',
    isRepeatedTie: true,
    attackerPiece: Piece.Paper,
    defenderPiece: Piece.Paper,
  });

  const resolved = {
    ...tied,
    attacker: Piece.Scissors,
    defender: Piece.Paper,
    outcome: 1,
    tiePending: false,
  };
  expect(getCombatAnimation(tied, resolved)).toMatchObject({
    resolution: 'resolved',
    attackerPiece: Piece.Scissors,
    defenderPiece: Piece.Paper,
    winnerOwner: Owner.P0,
  });
});

test('matches the Rive attack timing for every weapon', () => {
  expect(combatAttackDurationMs(Piece.Rock)).toBe(383);
  expect(combatAttackDurationMs(Piece.Paper)).toBe(500);
  expect(combatAttackDurationMs(Piece.Scissors)).toBe(966);
});

test('matches mounted Rive jump timing for horizontal and vertical movement', () => {
  const move = { from: { x: 1, y: 1 }, to: { x: 2, y: 1 }, owner: Owner.P0, piece: Piece.Rock };
  expect(pieceMoveDurationMs(move)).toBeCloseTo(633.333, 2);
  expect(pieceMoveDurationMs({ ...move, to: { x: 1, y: 2 } })).toBe(750);
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
