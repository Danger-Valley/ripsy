import assert from 'node:assert/strict';
import test from 'node:test';
import { Choice, Owner, Phase, Piece, toIdx, WIDTH, HEIGHT, type GameState } from '@rps/core';
import { classifyGameTransition, getPieceMoveAnimation, getTrapAnimation, RIVE_TRAP_DURATION_MS } from '../app/game/[id]/game-animation';

test('recognizes an authoritative trap collision without treating it as a normal move', () => {
  const from = { x: 3, y: 5 };
  const to = { x: 3, y: 4 };
  const previous = gameState();
  previous.owners[toIdx(from.x, from.y)] = Owner.P0;
  previous.pieces[toIdx(from.x, from.y)] = Piece.Paper;
  previous.owners[toIdx(to.x, to.y)] = Owner.P1;
  // The opponent trap is still hidden in this player-specific snapshot.
  previous.pieces[toIdx(to.x, to.y)] = Piece.Empty;

  const next = clone(previous);
  next.isP1Turn = true;
  next.live0 = 13;
  next.attacker = Piece.Paper;
  next.defender = Piece.Trap;
  next.outcome = -1;
  next.tieFrom = from;
  next.tieTo = to;
  next.owners[toIdx(from.x, from.y)] = Owner.None;
  next.pieces[toIdx(from.x, from.y)] = Piece.Empty;
  next.pieces[toIdx(to.x, to.y)] = Piece.Trap;

  assert.equal(classifyGameTransition(previous, next), 'trap');
  assert.deepEqual(getTrapAnimation(previous, next), {
    from,
    to,
    attackerOwner: Owner.P0,
    trapOwner: Owner.P1,
    attackerPiece: Piece.Paper,
  });
  assert.equal(getPieceMoveAnimation(previous, next), null);
  assert.equal(Math.round(RIVE_TRAP_DURATION_MS), 783);
});

test('does not invent a trap animation from an unrelated loss', () => {
  const previous = gameState();
  const next = clone(previous);
  next.attacker = Piece.Rock;
  next.defender = Piece.Paper;
  next.outcome = -1;
  assert.equal(getTrapAnimation(previous, next), null);
});

function gameState(): GameState {
  return {
    gameId: 'trap-test',
    phase: Phase.Active,
    isP1Turn: false,
    owners: Array.from({ length: WIDTH * HEIGHT }, () => Owner.None),
    pieces: Array.from({ length: WIDTH * HEIGHT }, () => Piece.Empty),
    live0: 14,
    live1: 14,
    attacker: Piece.Empty,
    defender: Piece.Empty,
    outcome: 0,
    playerChoice: Choice.None,
    tiePending: false,
    tieRound: 0,
    tieFrom: { x: 0, y: 0 },
    tieTo: { x: 0, y: 0 },
    p0: 'player-0',
    p1: 'player-1',
    winner: null,
    clock0Ms: 600_000,
    clock1Ms: 600_000,
    clockRunning: Owner.P0,
    lineupDeadlineAt: null,
    finishReason: null,
  };
}

function clone(state: GameState): GameState {
  return { ...state, owners: [...state.owners], pieces: [...state.pieces], tieFrom: { ...state.tieFrom }, tieTo: { ...state.tieTo } };
}
