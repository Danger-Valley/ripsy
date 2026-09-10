import React from 'react';
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
