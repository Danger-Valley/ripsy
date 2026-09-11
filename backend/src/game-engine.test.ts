import assert from 'node:assert/strict';
import test from 'node:test';
import { Choice, Owner, Phase, Piece } from '@rps/core';
import {
  chooseWeapon,
  createGameRecord,
  gameView,
  joinGame,
  movePiece,
  submitLineup,
} from './game-engine.js';

const lineup = [
  ...Array(4).fill(Piece.Rock),
  ...Array(4).fill(Piece.Paper),
  ...Array(4).fill(Piece.Scissors),
  Piece.Flag,
  Piece.Trap,
];
const xs = Array.from({ length: 14 }, (_, index) => index % 7);
const aliceYs = Array.from({ length: 14 }, (_, index) => 5 + Math.floor(index / 7));
const bobYs = Array.from({ length: 14 }, (_, index) => Math.floor(index / 7));

test('creates, joins, and starts a game after both lineups', () => {
  const game = createGameRecord('game-1', 'alice');
  joinGame(game, 'bob');
  assert.equal(game.phase, Phase.Joined);
  submitLineup(game, 'alice', xs, aliceYs, lineup);
  assert.equal(game.phase, Phase.LineupP0Set);
  submitLineup(game, 'bob', xs, bobYs, lineup);
  assert.equal(game.phase, Phase.Active);
  assert.equal(game.live0, 14);
  assert.equal(game.live1, 14);
});

test('lets the creator save and replace a lineup before an opponent joins', () => {
  const game = createGameRecord('game-1', 'alice');
  submitLineup(game, 'alice', xs, aliceYs, lineup);
  assert.equal(game.phase, Phase.LineupP0Set);
  assert.equal(game.p1, '');

  const replacedXs = [...xs];
  [replacedXs[0], replacedXs[4]] = [replacedXs[4]!, replacedXs[0]!];
  submitLineup(game, 'alice', replacedXs, aliceYs, lineup);
  assert.equal(game.phase, Phase.LineupP0Set);
  assert.equal(game.pieces[5 * 7], Piece.Paper);
  assert.equal(game.pieces[5 * 7 + 4], Piece.Rock);

  joinGame(game, 'bob');
  assert.equal(game.phase, Phase.LineupP0Set);
  submitLineup(game, 'bob', xs, bobYs, lineup);
  assert.equal(game.phase, Phase.Active);
});

test('lets either player replace a saved lineup until both players are ready', () => {
  const game = createGameRecord('game-1', 'alice');
  joinGame(game, 'bob');
  submitLineup(game, 'bob', xs, bobYs, lineup);
  assert.equal(game.phase, Phase.LineupP1Set);
  submitLineup(game, 'bob', xs, bobYs, [...lineup].reverse());
  assert.equal(game.phase, Phase.LineupP1Set);

  submitLineup(game, 'alice', xs, aliceYs, lineup);
  assert.equal(game.phase, Phase.Active);
  assert.throws(() => submitLineup(game, 'alice', xs, aliceYs, lineup), /cannot be changed/);
});

test('hides opponent pieces in player-specific views', () => {
  const game = createGameRecord('game-1', 'alice');
  joinGame(game, 'bob');
  submitLineup(game, 'alice', xs, aliceYs, lineup);
  submitLineup(game, 'bob', xs, bobYs, lineup);
  const alice = gameView(game, 'alice');
  const bobPieceIndex = game.owners.findIndex((owner) => owner === Owner.P1);
  assert.equal(alice.pieces[bobPieceIndex], Piece.Empty);
});

test('rejects spectators and invalid battle choices', () => {
  const game = createGameRecord('game-1', 'alice');
  joinGame(game, 'bob');
  assert.throws(() => submitLineup(game, 'mallory', [], [], []), /not a player/);
  assert.throws(() => chooseWeapon(game, 'alice', Choice.Rock), /no tied battle/);
});

test('applies a legal move without external state', () => {
  const game = createGameRecord('game-1', 'alice');
  joinGame(game, 'bob');
  submitLineup(game, 'alice', xs, aliceYs, lineup);
  submitLineup(game, 'bob', xs, bobYs, lineup);
  // The first lineup piece is a rock at (0,5), with (0,4) empty.
  movePiece(game, 'alice', 0, 5, 0, 4);
  assert.equal(game.owners[5 * 7], Owner.None);
  assert.equal(game.owners[4 * 7], Owner.P0);
  assert.equal(game.isP1Turn, true);
});
