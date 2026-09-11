import React from 'react';
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
