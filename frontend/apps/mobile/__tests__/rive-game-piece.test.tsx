import React from 'react';
import { AccessibilityInfo } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Piece } from '@rps/core';
import { RiveGamePiece } from '../src/components/rive-game-piece';

const mockRiveViewRef = {
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

test('always hides weapons for traps', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <RiveGamePiece file={{} as never} isMine mirrored={false} piece={Piece.Trap} size={80} />,
    );
    await Promise.resolve();
  });

  expect(mockRiveViewRef.setBooleanInputValue).toHaveBeenCalledWith('WeaponVisible', false);
  expect(mockRiveViewRef.triggerInput).toHaveBeenCalledWith('Trap Idle');
});

test('starts an opponent preview after a one-time random delay', async () => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);

  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <RiveGamePiece file={{} as never} isMine={false} mirrored={false} piece={Piece.Empty} size={80} staggerStart />,
    );
    await Promise.resolve();
  });

  expect(mockRiveViewRef.reset).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(230);
    await Promise.resolve();
  });

  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.playIfNeeded).toHaveBeenCalledTimes(1);
});
