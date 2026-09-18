import { canMoveTo, Choice, HEIGHT, isMovablePiece, Owner, Phase, Piece, toIdx, toXY, WIDTH } from '@rps/core';
import { createGameRecord, joinGame, submitLineup, type GameRecord } from '@rps/game-engine';

export const LOCAL_PLAYER_ID = 'local-player';
export const COMPUTER_PLAYER_ID = 'computer';

export function createComputerGame(random: () => number = Math.random, now = new Date()) {
  const game = createGameRecord('computer', LOCAL_PLAYER_ID, now);
  joinGame(game, COMPUTER_PLAYER_ID, now);
  const lineup = randomLineup(false, random);
  submitLineup(game, COMPUTER_PLAYER_ID, lineup.xs, lineup.ys, lineup.pieces, now);
  return game;
}

export function chooseComputerMove(game: GameRecord, random: () => number = Math.random) {
  if (game.phase !== Phase.Active || !game.isP1Turn || game.tiePending) return null;
  const moves: Array<{ fromX: number; fromY: number; toX: number; toY: number; score: number }> = [];
  for (let from = 0; from < game.owners.length; from += 1) {
    if (game.owners[from] !== Owner.P1 || !isMovablePiece(game.pieces[from]!)) continue;
    const source = toXY(from);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const toX = source.x + dx;
      const toY = source.y + dy;
      if (toX < 0 || toX >= WIDTH || toY < 0 || toY >= HEIGHT) continue;
      const targetOwner = game.owners[toIdx(toX, toY)] ?? Owner.None;
      if (targetOwner === Owner.P1) continue;
      if (!canMoveTo(game.pieces[from]!, targetOwner)) continue;
      const contact = targetOwner === Owner.P0 ? 18 : 0;
      const pressure = (toY - source.y) * 3 + toY * .35;
      const centre = 3 - Math.abs(3 - toX);
      moves.push({ fromX: source.x, fromY: source.y, toX, toY, score: contact + pressure + centre + random() * 6 });
    }
  }
  moves.sort((a, b) => b.score - a.score);
  const move = moves[0];
  return move ? { fromX: move.fromX, fromY: move.fromY, toX: move.toX, toY: move.toY } : null;
}

export function chooseComputerWeapon(random: () => number = Math.random): Choice {
  const choices = [Choice.Rock, Choice.Paper, Choice.Scissors] as const;
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]!;
}

function randomLineup(isPlayer0: boolean, random: () => number) {
  const pieces: Piece[] = [Piece.Rock, Piece.Rock, Piece.Rock, Piece.Rock, Piece.Paper, Piece.Paper, Piece.Paper, Piece.Paper, Piece.Scissors, Piece.Scissors, Piece.Scissors, Piece.Scissors, Piece.Flag, Piece.Trap];
  const cells = Array.from({ length: WIDTH * 2 }, (_, index) => ({ x: index % WIDTH, y: isPlayer0 ? HEIGHT - 2 + Math.floor(index / WIDTH) : Math.floor(index / WIDTH) }));
  shuffle(pieces, random); shuffle(cells, random);
  return { xs: cells.map(cell => cell.x), ys: cells.map(cell => cell.y), pieces };
}
function shuffle<T>(items: T[], random: () => number) { for (let index = items.length - 1; index > 0; index -= 1) { const target = Math.floor(random() * (index + 1)); [items[index], items[target]] = [items[target]!, items[index]!]; } }
