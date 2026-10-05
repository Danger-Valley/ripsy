import React from 'react';
import { Animated, Platform, StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { HEIGHT, Owner, Phase, Piece, toIdx, WIDTH, type GameState } from '@rps/core';
import { GameBoard } from '../src/components/game-board';
import type { PieceMoveAnimation } from '../src/game-animation';

// The Android styles must be evaluated as Android, not changed after import.
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  const mocked = Object.create(native);
  Object.defineProperty(mocked, 'Platform', { value: { ...native.Platform, OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.native ?? options.default } });
  return mocked;
});

test('Android keeps native mount order and row/cell parents fixed across selection, takeoff, landing and traps', async () => {
  expect(Platform.OS).toBe('android');
  const owners = Array<Owner>(WIDTH * HEIGHT).fill(Owner.None);
  const pieces = Array<Piece>(WIDTH * HEIGHT).fill(Piece.Empty);
  for (const y of [0, 1, HEIGHT - 2, HEIGHT - 1]) {
    for (let x = 0; x < WIDTH; x++) {
      owners[toIdx(x, y)] = y < 2 ? Owner.P1 : Owner.P0;
      pieces[toIdx(x, y)] = y < 2 ? Piece.Empty : Piece.Rock;
    }
  }
  const state: GameState = {
    gameId: 'abcdef12', phase: Phase.Active, p0: 'alice', p1: 'bob', isP1Turn: false,
    owners, pieces, live0: 14, live1: 14, attacker: 0, defender: 0, outcome: 0,
    playerChoice: 0, tiePending: false, tieFrom: { x: 0, y: 0 }, tieTo: { x: 0, y: 0 }, winner: null,
  };
  const move: PieceMoveAnimation = { from: { x: 0, y: 5 }, to: { x: 0, y: 4 }, owner: Owner.P0, piece: Piece.Rock };
  const progress = new Animated.Value(0);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const renderBoard = (stage: 'idle' | 'selected' | 'moving' | 'landed' | 'trap') => (
    <GameBoard state={state} isPlayer1={false} ownOwner={Owner.P0}
      selected={stage === 'selected' ? move.from : null}
      moveAnimation={stage === 'moving' || stage === 'landed' ? move : null}
      moveProgress={progress}
      trapAnimation={stage === 'trap' ? { from: move.from, to: { x: 1, y: 0 }, attackerOwner: Owner.P0, trapOwner: Owner.P1, attackerPiece: Piece.Rock } : null}
    />
  );
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(renderBoard('idle')); });
  const stationary = renderer.root.find(node => node.props.accessibilityLabel === 'Row 7, column 7, your rock').findByProps({ testID: 'rive-view' });
  for (const stage of ['selected', 'moving', 'landed', 'idle', 'trap', 'idle'] as const) {
    await ReactTestRenderer.act(async () => { renderer.update(renderBoard(stage)); });
    const cells = renderer.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Row '));
    for (const cell of cells) {
      expect(cell.props.collapsable).toBe(false);
      expect(cell.parent!.props.collapsable).toBe(false);
      // Fabric sorts by zIndex, not elevation. No row/cell changes mountIndex.
      expect(StyleSheet.flatten(cell.props.style).zIndex ?? 0).toBe(0);
      expect(StyleSheet.flatten(cell.parent!.props.style).zIndex ?? 0).toBe(0);
    }
    expect(renderer.root.find(node => node.props.accessibilityLabel === 'Row 7, column 7, your rock').findByProps({ testID: 'rive-view' })).toBe(stationary);
    if (stage === 'moving' || stage === 'landed') {
      expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'moving-source-row' }).props.style).elevation).toBe(19);
      const source = renderer.root.find(node => node.props.accessibilityLabel === 'Row 6, column 1, your rock');
      expect(StyleSheet.flatten(source.props.style).elevation).toBe(20);
      expect(StyleSheet.flatten(source.findByProps({ testID: 'piece-visual' }).props.style).zIndex ?? 0).toBe(0);
    }
  }
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});
