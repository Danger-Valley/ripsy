import React from 'react';
import { StyleSheet, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Owner, Phase, type GameState } from '@rps/core';
import { GameClocks } from '../src/components/game-clocks';
import { colors } from '../src/theme';

const state = (overrides: Partial<GameState> = {}): GameState => ({
  gameId: 'abcdef12', phase: Phase.Active, p0: 'alice', p1: 'bob', isP1Turn: false,
  owners: [], pieces: [], live0: 12, live1: 11, attacker: 0, defender: 0, outcome: 0,
  playerChoice: 0, tiePending: false, tieFrom: { x: 0, y: 0 }, tieTo: { x: 0, y: 0 }, winner: null,
  clock0Ms: 600_000, clock1Ms: 580_000, clockRunning: Owner.P0, ...overrides,
});

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(1_000); });
afterEach(() => jest.useRealTimers());

test('player one sees their own clock/count on the left and the running opponent on the right', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<GameClocks state={state()} ownOwner={Owner.P1} />);
  });
  expect(renderer.root.findByProps({ accessibilityLabel: 'Your time 9:40, paused' })).toBeDefined();
  expect(renderer.root.findByProps({ accessibilityLabel: 'Opponent time 10:00, running' })).toBeDefined();
  expect(renderer.root.findAllByType(Text).filter(node => node.props.children === 'TURN')).toHaveLength(1);
  const counts = renderer.root.findAllByType(Text).filter(node => Array.isArray(node.props.children) && node.props.children[1] === ' fighters');
  expect(counts.map(node => node.props.children[0])).toEqual([11, 12]);
  await ReactTestRenderer.act(() => { jest.advanceTimersByTime(1_000); });
  expect(renderer.root.findByProps({ accessibilityLabel: 'Opponent time 9:59, running' })).toBeDefined();
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('both final clocks remain mounted and frozen after the result', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<GameClocks state={state({ phase: Phase.Finished, clock0Ms: 0, clockRunning: Owner.None })} ownOwner={Owner.P0} />);
  });
  await ReactTestRenderer.act(() => { jest.advanceTimersByTime(10_000); });
  expect(renderer.root.findByProps({ testID: 'game-clocks' })).toBeDefined();
  expect(renderer.root.findByProps({ accessibilityLabel: 'Your time 0:00, paused' })).toBeDefined();
  expect(renderer.root.findByProps({ accessibilityLabel: 'Opponent time 9:40, paused' })).toBeDefined();
  expect(renderer.root.findAllByType(Text).filter(node => node.props.children === 'TURN')).toHaveLength(0);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('lineup setup does not start or display the chess clocks', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(<GameClocks state={state({ phase: Phase.Joined })} ownOwner={Owner.P0} />); });
  expect(renderer.toJSON()).toBeNull();
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('rounded outlines sit above the artwork and zero time does not recolor the player frame', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<GameClocks state={state({ phase: Phase.Finished, clock0Ms: 0, clockRunning: Owner.None })} ownOwner={Owner.P0} />);
  });
  for (const side of ['you', 'opponent']) {
    const outline = renderer.root.findByProps({ testID: `clock-outline-${side}` });
    const face = renderer.root.findByProps({ testID: `clock-face-${side}` });
    const outlineStyle = StyleSheet.flatten(outline.props.style);
    const faceStyle = StyleSheet.flatten(face.props.style);
    expect(outlineStyle).toMatchObject({ borderWidth: 2, borderRadius: 20, borderColor: colors.kitPanel });
    expect(outlineStyle.borderBottomWidth).toBeUndefined();
    expect(faceStyle).toMatchObject({ overflow: 'hidden', borderRadius: outlineStyle.borderRadius });
    const layers = React.Children.toArray(face.props.children) as React.ReactElement<{ testID?: string }>[];
    expect(layers[layers.length - 1].props.testID).toBe(`clock-outline-${side}`);
  }
  const timer = renderer.root.findAllByType(Text).find(node => node.props.children === '0:00')!;
  expect(StyleSheet.flatten(timer.props.style).color).toBe(colors.dangerShadow);
  await ReactTestRenderer.act(() => renderer.unmount());
});
