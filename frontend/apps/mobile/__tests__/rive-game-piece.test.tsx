import React from 'react';
import { AccessibilityInfo } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Piece } from '@rps/core';
import { RiveGamePiece } from '../src/components/rive-game-piece';

const mockRiveViewRef = {
  awaitViewReady: jest.fn(() => Promise.resolve(true)),
  pause: jest.fn(() => Promise.resolve()),
  play: jest.fn(() => Promise.resolve()),
  playIfNeeded: jest.fn(),
  reset: jest.fn(() => Promise.resolve()),
  setBooleanInputValue: jest.fn(),
  setNumberInputValue: jest.fn(),
  triggerInput: jest.fn(),
};

jest.mock('@rive-app/react-native', () => {
  const ReactModule = require('react');
  return {
    Fit: { Contain: 'contain' },
    RiveView: (props: object) => ReactModule.createElement('RiveView', props),
    useRive: () => ({ riveViewRef: mockRiveViewRef, setHybridRef: { f: () => undefined } }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('clears the weapon value and visibility before entering trap idle', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <RiveGamePiece file={{} as never} isMine piece={Piece.Trap} size={80} />,
    );
    await Promise.resolve();
  });

  expect(mockRiveViewRef.setNumberInputValue).not.toHaveBeenCalledWith('Weapon', Piece.Trap);
  expect(mockRiveViewRef.setNumberInputValue).toHaveBeenCalledWith('Weapon', Piece.Empty);
  expect(mockRiveViewRef.setNumberInputValue).toHaveBeenCalledWith('WeaponVisible', 0);
  expect(mockRiveViewRef.triggerInput).toHaveBeenCalledWith('Trap Idle');
  const weaponCalls = mockRiveViewRef.setNumberInputValue.mock.calls.filter(([name]) => name === 'Weapon');
  const visibilityCalls = mockRiveViewRef.setNumberInputValue.mock.calls.filter(([name]) => name === 'WeaponVisible');
  expect(weaponCalls).toEqual([
    ['Weapon', Piece.Empty],
    ['Weapon', Piece.Empty],
  ]);
  expect(visibilityCalls).toEqual([
    ['WeaponVisible', 0],
    ['WeaponVisible', 0],
  ]);
  expect(mockRiveViewRef.play.mock.invocationCallOrder[0]).toBeLessThan(
    mockRiveViewRef.triggerInput.mock.invocationCallOrder[0]!,
  );
  expect(mockRiveViewRef.setNumberInputValue.mock.invocationCallOrder.at(-1)).toBeLessThan(
    mockRiveViewRef.triggerInput.mock.invocationCallOrder[0]!,
  );
});

test('fires a movement trigger only after the state machine starts', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <RiveGamePiece actionTrigger="Jump Right" file={{} as never} isMine piece={Piece.Rock} size={80} />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockRiveViewRef.triggerInput).toHaveBeenCalledWith('Jump Right');
  expect(mockRiveViewRef.play.mock.invocationCallOrder[0]).toBeLessThan(
    mockRiveViewRef.triggerInput.mock.invocationCallOrder[0]!,
  );
});

test('plays sequential combat triggers without resetting the state machine', async () => {
  const renderPiece = (actionTrigger: 'Attack Prepare' | 'Attack') => (
    <RiveGamePiece actionTrigger={actionTrigger} file={{} as never} isMine piece={Piece.Rock} size={80} />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(renderPiece('Attack Prepare'));
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.triggerInput).toHaveBeenCalledWith('Attack Prepare');

  await ReactTestRenderer.act(async () => {
    renderer.update(renderPiece('Attack'));
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.triggerInput.mock.calls.map(([trigger]) => trigger)).toEqual([
    'Attack Prepare',
    'Attack',
  ]);
});

test('configures a local weapon before starting playback', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <RiveGamePiece file={{} as never} isMine piece={Piece.Paper} size={80} />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(renderer.root.findByType('RiveView' as never).props.autoPlay).toBe(false);
  expect(mockRiveViewRef.pause).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.setNumberInputValue).toHaveBeenCalledWith('Weapon', Piece.Paper);
  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.setNumberInputValue.mock.invocationCallOrder[0]).toBeLessThan(
    mockRiveViewRef.play.mock.invocationCallOrder[0]!,
  );
});

test('starts an opponent preview after a one-time random delay', async () => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);

  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <RiveGamePiece file={{} as never} isMine={false} piece={Piece.Empty} size={80} staggerStart />,
    );
    await Promise.resolve();
  });

  expect(renderer!.root.findAllByType('RiveView' as never)).toHaveLength(0);
  expect(mockRiveViewRef.reset).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(230);
    await Promise.resolve();
  });

  expect(renderer!.root.findAllByType('RiveView' as never)).toHaveLength(1);
  expect(mockRiveViewRef.reset).not.toHaveBeenCalled();
  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(1);
});

test('does not reset the Android front state machine for opponent figures', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <RiveGamePiece file={{} as never} isMine={false} piece={Piece.Empty} size={80} />,
    );
    await Promise.resolve();
  });

  expect(mockRiveViewRef.reset).not.toHaveBeenCalled();
  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(1);
});

test('remounts with the front state machine when a figure becomes an opponent', async () => {
  const renderPiece = (isMine: boolean) => (
    <RiveGamePiece file={{} as never} isMine={isMine} piece={Piece.Empty} size={80} />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(renderPiece(true));
    await Promise.resolve();
  });
  const back = renderer.root.findByType('RiveView' as never);

  await ReactTestRenderer.act(async () => {
    renderer.update(renderPiece(false));
    await Promise.resolve();
  });
  const front = renderer.root.findByType('RiveView' as never);

  expect(front).not.toBe(back);
  expect(front.props.stateMachineName).toBe('State Machine Front');
});
