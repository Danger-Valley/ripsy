import React from 'react';
import { AccessibilityInfo } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { HEIGHT, Owner, Phase, Piece, toIdx, WIDTH, type GameState } from '@rps/core';
import { GameBoard } from '../src/components/game-board';

function createState(): GameState {
  const owners: Owner[] = Array.from({ length: WIDTH * HEIGHT }, () => Owner.None);
  const pieces: Piece[] = Array.from({ length: WIDTH * HEIGHT }, () => Piece.Empty);
  owners[toIdx(0, 0)] = Owner.P0;
  pieces[toIdx(0, 0)] = Piece.Rock;
  owners[toIdx(1, 0)] = Owner.P1;
  pieces[toIdx(1, 0)] = Piece.Paper;
  return {
    gameId: 'abcdef12', phase: Phase.Active, p0: 'alice', p1: 'bob', isP1Turn: false,
    owners, pieces, live0: 1, live1: 1, attacker: 0, defender: 0, outcome: 0,
    playerChoice: 0, tiePending: false, tieFrom: { x: 0, y: 0 }, tieTo: { x: 0, y: 0 }, winner: null,
  };
}

test('exposes piece names and only actionable cells as buttons', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GameBoard
        availableMoves={[]}
        interactionEnabled
        isPlayer1={false}
        onCellPress={() => undefined}
        ownOwner={Owner.P0}
        state={createState()}
      />,
    );
  });

  const cells = renderer.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Row '));
  expect(new Set(cells.map(cell => cell.props.accessibilityLabel)).size).toBe(WIDTH * HEIGHT);
  expect(cells.find(cell => cell.props.accessibilityLabel === 'Row 1, column 1, your rock')?.props).toMatchObject({
    accessibilityLabel: 'Row 1, column 1, your rock',
    accessibilityHint: 'Select this piece',
    accessibilityRole: 'button',
  });
  expect(cells.find(cell => cell.props.accessibilityLabel === 'Row 1, column 2, opponent piece')?.props).toMatchObject({
    accessibilityLabel: 'Row 1, column 2, opponent piece',
    accessibilityRole: 'text',
    disabled: true,
  });
  const figures = renderer.root.findAll(node => node.props.testID === 'rive-view');
  expect(figures.map(figure => figure.props.stateMachineName)).toEqual([
    'State Machine Back',
    'State Machine Front',
  ]);
  const pieceVisuals = renderer.root.findAll(node => node.props.testID === 'piece-visual');
  expect(pieceVisuals.length).toBeGreaterThanOrEqual(2);
  expect(pieceVisuals.every(visual => visual.props.pointerEvents === 'none')).toBe(true);
});

test('announces selected pieces and legal move targets', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GameBoard
        availableMoves={[{ x: 0, y: 1 }]}
        interactionEnabled
        isPlayer1={false}
        onCellPress={() => undefined}
        ownOwner={Owner.P0}
        selected={{ x: 0, y: 0 }}
        state={createState()}
      />,
    );
  });

  const selected = renderer.root.find(node => node.props.accessibilityHint === 'Selected piece');
  const move = renderer.root.find(node => node.props.accessibilityHint === 'Move selected piece here');
  expect(selected.props.accessibilityState.selected).toBe(true);
  expect(move.props.accessibilityRole).toBe('button');
});

test('renders the local lineup preview as non-interactive before battle', async () => {
  const state = createState();
  state.phase = Phase.Joined;
  state.owners.fill(Owner.None);
  state.pieces.fill(Piece.Empty);

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GameBoard
        isPlayer1={false}
        ownOwner={Owner.P0}
        previewLineup={[{ x: 0, y: HEIGHT - 1, piece: Piece.Flag }]}
        state={state}
      />,
    );
  });

  expect(renderer.root.find(node => node.props.accessibilityLabel === 'Row 7, column 1, your flag').props).toMatchObject({
    accessibilityRole: 'text',
    disabled: true,
  });
  expect(renderer.root.findAll(node => node.props.testID === 'rive-view')).toHaveLength(1);
});

test('renders an unarmed opponent formation during lineup setup', async () => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
  const state = createState();
  state.phase = Phase.Created;
  state.owners.fill(Owner.None);
  state.pieces.fill(Piece.Empty);

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <GameBoard
        isPlayer1={false}
        ownOwner={Owner.P0}
        showOpponentFormation
        state={state}
      />,
    );
    await Promise.resolve();
  });

  const opponentCells = renderer.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.endsWith('opponent piece'));
  expect(new Set(opponentCells.map(cell => cell.props.accessibilityLabel)).size).toBe(WIDTH * 2);
  expect(renderer.root.findAll(node => node.props.testID === 'rive-view')).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(230);
    await Promise.resolve();
  });

  expect(renderer.root.findAll(node => node.props.testID === 'rive-view').map(figure => figure.props.stateMachineName)).toEqual(
    Array(WIDTH * 2).fill('State Machine Front'),
  );
  await ReactTestRenderer.act(() => {
    renderer.unmount();
  });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('keeps a lineup figure mounted while its piece changes', async () => {
  const state = createState();
  state.phase = Phase.Created;
  state.owners.fill(Owner.None);
  state.pieces.fill(Piece.Empty);
  const renderBoard = (piece: Piece) => (
    <GameBoard
      isPlayer1={false}
      ownOwner={Owner.P0}
      previewLineup={[{ x: 0, y: HEIGHT - 1, piece }]}
      state={state}
    />
  );

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(renderBoard(Piece.Trap));
  });
  const trapInstance = renderer.root.find(node => node.props.testID === 'rive-view');

  await ReactTestRenderer.act(() => {
    renderer.update(renderBoard(Piece.Rock));
  });
  const rockInstance = renderer.root.find(node => node.props.testID === 'rive-view');

  expect(rockInstance).toBe(trapInstance);
  expect(renderer.root.find(node => node.props.accessibilityLabel === 'Row 7, column 1, your rock')).toBeDefined();
});
