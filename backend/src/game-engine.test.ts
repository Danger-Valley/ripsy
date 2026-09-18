import assert from 'node:assert/strict';
import test from 'node:test';
import { Choice, FigureVariant, Owner, Phase, Piece, toIdx } from '@rps/core';
import {
  chooseWeapon,
  createGameRecord,
  gameView,
  joinGame,
  movePiece,
  settleGameDeadline,
  settleGameClock,
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

test('assigns seven of each figure and keeps the figure variant through moves', () => {
  const game = createGameRecord('game-figures', 'alice');
  joinGame(game, 'bob');
  submitLineup(game, 'alice', xs, aliceYs, lineup);
  submitLineup(game, 'bob', xs, bobYs, lineup);

  const aliceVariants = game.figureVariants.filter((variant, index) => game.owners[index] === Owner.P0 && variant !== FigureVariant.Empty);
  assert.equal(aliceVariants.filter(variant => variant === FigureVariant.Fig1).length, 7);
  assert.equal(aliceVariants.filter(variant => variant === FigureVariant.Fig2).length, 7);

  const from = toIdx(0, 5);
  const to = toIdx(0, 4);
  const variant = game.figureVariants[from];
  movePiece(game, 'alice', 0, 5, 0, 4);
  assert.equal(game.figureVariants[from], FigureVariant.Empty);
  assert.equal(game.figureVariants[to], variant);
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

test('keeps a battle survivor weapon visible to the opponent after it moves', () => {
  const game = createGameRecord('game-1', 'alice');
  joinGame(game, 'bob');
  submitLineup(game, 'alice', xs, aliceYs, lineup);
  submitLineup(game, 'bob', xs, bobYs, lineup);

  game.owners.fill(Owner.None);
  game.pieces.fill(Piece.Empty);
  game.revealed.fill(false);
  game.live0 = 1;
  game.live1 = 2;
  game.owners[toIdx(0, 4)] = Owner.P0;
  game.pieces[toIdx(0, 4)] = Piece.Rock;
  game.owners[toIdx(0, 3)] = Owner.P1;
  game.pieces[toIdx(0, 3)] = Piece.Scissors;
  game.owners[toIdx(2, 1)] = Owner.P1;
  game.pieces[toIdx(2, 1)] = Piece.Paper;

  movePiece(game, 'alice', 0, 4, 0, 3);
  assert.equal(gameView(game, 'bob').pieces[toIdx(0, 3)], Piece.Rock);
  assert.equal(gameView(game, 'alice').pieces[toIdx(2, 1)], Piece.Empty, 'unrevealed pieces stay hidden');

  movePiece(game, 'bob', 2, 1, 2, 2);
  movePiece(game, 'alice', 0, 3, 0, 2);
  assert.equal(gameView(game, 'bob').pieces[toIdx(0, 2)], Piece.Rock, 'revealed identity follows the piece');
  assert.equal(game.revealed[toIdx(0, 3)], false);
});

test('rejects spectators and invalid battle choices', () => {
  const game = createGameRecord('game-1', 'alice');
  joinGame(game, 'bob');
  assert.throws(() => submitLineup(game, 'mallory', [], [], []), /not a player/);
  assert.throws(() => chooseWeapon(game, 'alice', Choice.Rock), /no tied battle/);
});

test('publishes and counts repeated tied weapon rounds before accepting new choices', () => {
  const game = createGameRecord('game-1', 'alice');
  joinGame(game, 'bob');
  submitLineup(game, 'alice', xs, aliceYs, lineup);
  submitLineup(game, 'bob', xs, bobYs, lineup);

  game.owners.fill(Owner.None);
  game.pieces.fill(Piece.Empty);
  game.revealed.fill(false);
  game.live0 = 1;
  game.live1 = 1;
  game.owners[toIdx(0, 4)] = Owner.P0;
  game.pieces[toIdx(0, 4)] = Piece.Rock;
  game.owners[toIdx(0, 3)] = Owner.P1;
  game.pieces[toIdx(0, 3)] = Piece.Rock;

  movePiece(game, 'alice', 0, 4, 0, 3);
  assert.equal(game.tiePending, true);
  assert.equal(game.tieRound, 0);

  chooseWeapon(game, 'alice', Choice.Paper);
  chooseWeapon(game, 'bob', Choice.Paper);

  assert.equal(game.tiePending, true);
  assert.equal(game.tieRound, 1);
  assert.equal(game.attacker, Piece.Paper);
  assert.equal(game.defender, Piece.Paper);
  assert.deepEqual(game.choices, [Choice.None, Choice.None]);
  assert.equal(gameView(game, 'alice').tieRound, 1);

  chooseWeapon(game, 'alice', Choice.Rock);
  chooseWeapon(game, 'bob', Choice.Scissors);
  assert.equal(game.tiePending, false);
  assert.equal(game.tieRound, 0);
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
  assert.equal(game.tieFrom, 5 * 7);
  assert.equal(game.tieTo, 4 * 7);
});

test('rejects moving a flag or trap', () => {
  const game = createGameRecord('game-stationary-pieces', 'alice');
  joinGame(game, 'bob');
  submitLineup(game, 'alice', xs, aliceYs, lineup);
  submitLineup(game, 'bob', xs, bobYs, lineup);

  game.owners.fill(Owner.None);
  game.pieces.fill(Piece.Empty);
  game.owners[toIdx(0, 5)] = Owner.P1;
  game.pieces[toIdx(0, 5)] = Piece.Flag;
  game.owners[toIdx(0, 4)] = Owner.P0;
  game.pieces[toIdx(0, 4)] = Piece.Rock;
  game.isP1Turn = true;
  assert.throws(() => movePiece(game, 'bob', 0, 5, 0, 4), /piece cannot move/);

  game.pieces[toIdx(0, 5)] = Piece.Trap;
  assert.throws(() => movePiece(game, 'bob', 0, 5, 0, 4), /piece cannot move/);
});

test('runs one cumulative ten-minute clock at a time and switches it after a move', () => {
  const startedAt = new Date('2026-01-01T00:00:00.000Z');
  const game = createGameRecord('game-1', 'alice', startedAt);
  joinGame(game, 'bob', startedAt);
  submitLineup(game, 'alice', xs, aliceYs, lineup, startedAt);
  submitLineup(game, 'bob', xs, bobYs, lineup, startedAt);

  movePiece(game, 'alice', 0, 5, 0, 4, new Date(startedAt.getTime() + 30_000));
  assert.equal(game.clock0Ms, 570_000);
  assert.equal(game.clock1Ms, 600_000);
  assert.equal(game.isP1Turn, true);

  movePiece(game, 'bob', 0, 1, 0, 2, new Date(startedAt.getTime() + 50_000));
  assert.equal(game.clock0Ms, 570_000);
  assert.equal(game.clock1Ms, 580_000);
  assert.equal(game.isP1Turn, false);
});

test('ends the game when the active player runs out of time', () => {
  const startedAt = new Date('2026-01-01T00:00:00.000Z');
  const game = createGameRecord('game-1', 'alice', startedAt);
  joinGame(game, 'bob', startedAt);
  submitLineup(game, 'alice', xs, aliceYs, lineup, startedAt);
  submitLineup(game, 'bob', xs, bobYs, lineup, startedAt);

  assert.equal(settleGameClock(game, new Date(startedAt.getTime() + 600_001)), true);
  assert.equal(game.phase, Phase.Finished);
  assert.equal(game.winner, 'bob');
  assert.equal(game.finishReason, 'timeout');
  assert.equal(game.clock0Ms, 0);
  assert.equal(game.clockStartedAt, null);
});

test('gives each player three minutes from arrival to save their first lineup', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const joinedAt = new Date(createdAt.getTime() + 45_000);
  const game = createGameRecord('game-1', 'alice', createdAt);
  assert.equal(game.lineupDeadline0At, createdAt.getTime() + 180_000);
  assert.equal(game.lineupDeadline1At, null);

  joinGame(game, 'bob', joinedAt);
  assert.equal(game.lineupDeadline0At, createdAt.getTime() + 180_000);
  assert.equal(game.lineupDeadline1At, joinedAt.getTime() + 180_000);
  assert.equal(gameView(game, 'alice', joinedAt).lineupDeadlineAt, game.lineupDeadline0At);
  assert.equal(gameView(game, 'bob', joinedAt).lineupDeadlineAt, game.lineupDeadline1At);
});

test('saving a lineup clears only that player deadline and keeps the lineup editable', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const game = createGameRecord('game-1', 'alice', now);
  joinGame(game, 'bob', now);

  submitLineup(game, 'alice', xs, aliceYs, lineup, new Date(now.getTime() + 30_000));
  assert.equal(game.lineupDeadline0At, null);
  assert.equal(game.lineupDeadline1At, now.getTime() + 180_000);

  submitLineup(game, 'alice', xs, aliceYs, [...lineup].reverse(), new Date(now.getTime() + 170_000));
  assert.equal(game.phase, Phase.LineupP0Set);
  assert.equal(game.lineupDeadline0At, null);
});

test('cancels the game without a winner when either lineup deadline expires', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const game = createGameRecord('game-1', 'alice', now);
  joinGame(game, 'bob', now);
  submitLineup(game, 'alice', xs, aliceYs, lineup, new Date(now.getTime() + 10_000));

  assert.equal(settleGameDeadline(game, new Date(now.getTime() + 180_001)), true);
  assert.equal(game.phase, Phase.Finished);
  assert.equal(game.winner, null);
  assert.equal(game.finishReason, 'lineup_timeout');
  assert.equal(game.lineupDeadline0At, null);
  assert.equal(game.lineupDeadline1At, null);
});
