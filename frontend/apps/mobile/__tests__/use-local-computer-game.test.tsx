import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { HEIGHT, Owner, Piece, WIDTH } from '@rps/core';
import { useLocalComputerGame } from '../src/hooks/use-local-computer-game';
import { useGameAnimationQueue } from '../src/hooks/use-game-animation-queue';

type LocalGame = ReturnType<typeof useLocalComputerGame>;

function GameProbe({ onRender }: { onRender: (game: LocalGame) => void }) {
  onRender(useLocalComputerGame());
  return null;
}

type LocalAnimation = ReturnType<typeof useGameAnimationQueue>;

function AnimatedGameProbe({ onRender }: { onRender: (game: LocalGame, animation: LocalAnimation) => void }) {
  const [presentationBusy, setPresentationBusy] = React.useState(false);
  const game = useLocalComputerGame(presentationBusy);
  return <AnimatedGameChild game={game} onAnimationStateChange={setPresentationBusy} onRender={onRender} />;
}

function AnimatedGameChild({ game, onAnimationStateChange, onRender }: {
  game: LocalGame;
  onAnimationStateChange: (isAnimating: boolean) => void;
  onRender: (game: LocalGame, animation: LocalAnimation) => void;
}) {
  const animation = useGameAnimationQueue(game.gameState);
  React.useEffect(() => onAnimationStateChange(animation.isAnimating), [animation.isAnimating, onAnimationStateChange]);
  onRender(game, animation);
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
  const beforeComputerMove = [...game.gameState.owners];

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(1_500);
    await Promise.resolve();
  });

  expect(game.gameState.isP1Turn).toBe(false);
  expect(game.gameState.owners).not.toEqual(beforeComputerMove);
  expect(game.gameState.owners.filter(owner => owner === Owner.P1)).toHaveLength(WIDTH * 2);

  await ReactTestRenderer.act(() => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('queues and displays the computer move after the player animation', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  jest.spyOn(Math, 'random').mockReturnValue(0);
  let game!: LocalGame;
  let animation!: LocalAnimation;
  const renderedMoves: Array<LocalAnimation['activeMove']> = [];
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <AnimatedGameProbe onRender={(nextGame, nextAnimation) => {
        game = nextGame;
        animation = nextAnimation;
        renderedMoves.push(nextAnimation.activeMove);
      }} />,
    );
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
  });
  await ReactTestRenderer.act(async () => {
    await jest.advanceTimersByTimeAsync(400);
  });
  await ReactTestRenderer.act(async () => {
    await game.movePiece(0, HEIGHT - 2, 0, HEIGHT - 3);
  });
  expect(animation.activeMove?.owner).toBe(Owner.P0);

  await ReactTestRenderer.act(async () => {
    await jest.advanceTimersByTimeAsync(1_000);
  });
  expect(game.gameState.isP1Turn).toBe(true);

  await ReactTestRenderer.act(async () => {
    await jest.advanceTimersByTimeAsync(700);
  });
  expect(game.gameState.isP1Turn).toBe(false);
  expect(renderedMoves.find(move => move?.owner === Owner.P1)).toMatchObject({
    owner: Owner.P1,
    from: { y: 1 },
    to: { y: 2 },
  });

  await ReactTestRenderer.act(async () => {
    await jest.advanceTimersByTimeAsync(900);
  });
  expect(animation.displayedState?.owners).toEqual(game.gameState.owners);

  await ReactTestRenderer.act(() => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});
