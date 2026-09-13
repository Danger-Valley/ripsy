import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { HEIGHT, Piece, WIDTH } from '@rps/core';
import { useLocalComputerGame } from '../src/hooks/use-local-computer-game';

type LocalGame = ReturnType<typeof useLocalComputerGame>;

function GameProbe({ onRender }: { onRender: (game: LocalGame) => void }) {
  onRender(useLocalComputerGame());
  return null;
}

test('computer move timer survives local clock updates', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  jest.spyOn(Math, 'random').mockReturnValue(0);
  let game!: LocalGame;
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<GameProbe onRender={next => { game = next; }} />);
  });

  const cells = Array.from({ length: WIDTH * 2 }, (_, index) => ({
    x: index % WIDTH,
    y: HEIGHT - 2 + Math.floor(index / WIDTH),
  }));
  const pieces = [
    Piece.Rock, Piece.Rock, Piece.Rock, Piece.Rock,
    Piece.Paper, Piece.Paper, Piece.Paper, Piece.Paper,
    Piece.Scissors, Piece.Scissors, Piece.Scissors, Piece.Scissors,
    Piece.Flag, Piece.Trap,
  ];

  await ReactTestRenderer.act(async () => {
    await game.submitLineup(cells.map(cell => cell.x), cells.map(cell => cell.y), pieces);
    await game.movePiece(0, HEIGHT - 2, 0, HEIGHT - 3);
  });
  expect(game.gameState.isP1Turn).toBe(true);

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(1_500);
    await Promise.resolve();
  });

  expect(game.gameState.isP1Turn).toBe(false);

  await ReactTestRenderer.act(() => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});
