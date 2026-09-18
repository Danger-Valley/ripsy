import { canMoveTo, Choice, HEIGHT, isMovablePiece, Owner, Phase, Piece, toIdx, WIDTH } from '@rps/core';
import { submitLineup } from '@rps/game-engine';
import {
  chooseComputerMove,
  chooseComputerWeapon,
  COMPUTER_PLAYER_ID,
  createComputerGame,
  LOCAL_PLAYER_ID,
} from '../src/local-computer-game';

test('creates an offline game with a valid hidden computer lineup', () => {
  const game = createComputerGame(() => 0.5, new Date('2026-01-01T00:00:00Z'));
  const computerPieces = game.pieces.filter((_piece, index) => game.owners[index] === Owner.P1);

  expect(game.p0).toBe(LOCAL_PLAYER_ID);
  expect(game.p1).toBe(COMPUTER_PLAYER_ID);
  expect(game.phase).toBe(Phase.LineupP1Set);
  expect(game.live1).toBe(14);
  expect(computerPieces.filter(piece => piece === Piece.Rock)).toHaveLength(4);
  expect(computerPieces.filter(piece => piece === Piece.Paper)).toHaveLength(4);
  expect(computerPieces.filter(piece => piece === Piece.Scissors)).toHaveLength(4);
  expect(computerPieces.filter(piece => piece === Piece.Flag)).toHaveLength(1);
  expect(computerPieces.filter(piece => piece === Piece.Trap)).toHaveLength(1);
});

test('computer selects a legal move without reading hidden opponent weapons', () => {
  const game = createComputerGame(() => 0.5);
  const cells = Array.from({ length: WIDTH * 2 }, (_, index) => ({ x: index % WIDTH, y: HEIGHT - 2 + Math.floor(index / WIDTH) }));
  const pieces = [
    Piece.Rock, Piece.Rock, Piece.Rock, Piece.Rock,
    Piece.Paper, Piece.Paper, Piece.Paper, Piece.Paper,
    Piece.Scissors, Piece.Scissors, Piece.Scissors, Piece.Scissors,
    Piece.Flag, Piece.Trap,
  ];
  submitLineup(game, LOCAL_PLAYER_ID, cells.map(cell => cell.x), cells.map(cell => cell.y), pieces);
  game.isP1Turn = true;

  const baseline = chooseComputerMove(game, () => 0.25);
  expect(baseline).not.toBeNull();
  const from = toIdx(baseline!.fromX, baseline!.fromY);
  const to = toIdx(baseline!.toX, baseline!.toY);
  expect(game.owners[from]).toBe(Owner.P1);
  expect(isMovablePiece(game.pieces[from]!)).toBe(true);
  expect(game.owners[to]).not.toBe(Owner.P1);
  expect(Math.abs(baseline!.fromX - baseline!.toX) + Math.abs(baseline!.fromY - baseline!.toY)).toBe(1);

  const changedSecrets = { ...game, owners: [...game.owners], pieces: [...game.pieces], choices: [...game.choices] as [Choice, Choice] };
  changedSecrets.pieces = changedSecrets.pieces.map((piece, index) => (
    changedSecrets.owners[index] === Owner.P0 && piece !== Piece.Trap && piece !== Piece.Flag ? Piece.Scissors : piece
  ));
  expect(chooseComputerMove(changedSecrets, () => 0.25)).toEqual(baseline);
});

test('computer tie-break choice is always rock, paper, or scissors', () => {
  expect(chooseComputerWeapon(() => 0)).toBe(Choice.Rock);
  expect(chooseComputerWeapon(() => 0.5)).toBe(Choice.Paper);
  expect(chooseComputerWeapon(() => 0.999)).toBe(Choice.Scissors);
});

test('flags can move only into empty cells while traps remain stationary', () => {
  expect(isMovablePiece(Piece.Flag)).toBe(true);
  expect(canMoveTo(Piece.Flag, Owner.None)).toBe(true);
  expect(canMoveTo(Piece.Flag, Owner.P0)).toBe(false);
  expect(isMovablePiece(Piece.Trap)).toBe(false);
  expect(isMovablePiece(Piece.Rock)).toBe(true);
});

test('computer never selects a flag attack', () => {
  const game = createComputerGame(() => 0.5);
  game.owners.fill(Owner.None);
  game.pieces.fill(Piece.Empty);
  game.owners[toIdx(0, 1)] = Owner.P1;
  game.pieces[toIdx(0, 1)] = Piece.Flag;
  game.owners[toIdx(0, 0)] = Owner.P0;
  game.pieces[toIdx(0, 0)] = Piece.Rock;
  game.phase = Phase.Active;
  game.isP1Turn = true;

  const move = chooseComputerMove(game, () => 0);
  expect(move).not.toBeNull();
  expect(move).not.toMatchObject({ fromX: 0, fromY: 1, toX: 0, toY: 0 });
  expect(game.owners[toIdx(move!.toX, move!.toY)]).toBe(Owner.None);
});
