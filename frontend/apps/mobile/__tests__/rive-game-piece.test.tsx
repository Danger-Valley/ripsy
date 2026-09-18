import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
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
const originalPlatformOS = Platform.OS;

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
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
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

test('activates a mounted trap only after its hidden idle state is configured', async () => {
  const onActionTriggered = jest.fn();
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <RiveGamePiece
        actionTrigger="Trap Activate"
        file={{} as never}
        isMine
        onActionTriggered={onActionTriggered}
        piece={Piece.Trap}
        size={80}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockRiveViewRef.triggerInput.mock.calls.map(([trigger]) => trigger)).toEqual([
    'Trap Idle',
    'Trap Activate',
  ]);
  expect(onActionTriggered).toHaveBeenCalledWith('Trap Activate');
});

test('keeps a revealed opponent trap in trap state after the collision scene', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <RiveGamePiece
        file={{} as never}
        isMine={false}
        piece={Piece.Trap}
        size={80}
      />,
    );
    await Promise.resolve();
  });

  expect(mockRiveViewRef.setNumberInputValue).toHaveBeenCalledWith('Weapon', Piece.Empty);
  expect(mockRiveViewRef.triggerInput).toHaveBeenCalledWith('Trap Activate');
});

test('starts the falling victim animation after its weapon is configured', async () => {
  const onActionTriggered = jest.fn();
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <RiveGamePiece
        actionTrigger="Fall In Trap"
        file={{} as never}
        isMine
        onActionTriggered={onActionTriggered}
        piece={Piece.Paper}
        size={80}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockRiveViewRef.setNumberInputValue).toHaveBeenCalledWith('Weapon', Piece.Paper);
  expect(mockRiveViewRef.triggerInput).toHaveBeenCalledWith('Fall In Trap');
  expect(onActionTriggered).toHaveBeenCalledWith('Fall In Trap');
});

test('fires a movement trigger only after the state machine starts', async () => {
  const onActionTriggered = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <RiveGamePiece actionTrigger="Jump Right" file={{} as never} isMine onActionTriggered={onActionTriggered} piece={Piece.Rock} size={80} />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockRiveViewRef.triggerInput).toHaveBeenCalledWith('Jump Right');
  // triggerInput already resumes the iOS state machine internally. Calling
  // playIfNeeded again in JS can enqueue a second native play before the first
  // one updates isPlaying, visibly restarting the jump.
  expect(mockRiveViewRef.playIfNeeded).not.toHaveBeenCalled();
  expect(mockRiveViewRef.play.mock.invocationCallOrder[0]).toBeLessThan(
    mockRiveViewRef.triggerInput.mock.invocationCallOrder[0]!,
  );
  expect(onActionTriggered).toHaveBeenCalledWith('Jump Right');

  await ReactTestRenderer.act(async () => {
    renderer.update(
      <RiveGamePiece actionTrigger="Jump Right" file={{} as never} isMine onActionTriggered={onActionTriggered} piece={Piece.Rock} size={80} />,
    );
    await Promise.resolve();
  });

  expect(mockRiveViewRef.triggerInput).toHaveBeenCalledTimes(1);
  expect(onActionTriggered).toHaveBeenCalledTimes(1);
});

test('reports when a destination instance is configured for a seamless handoff', async () => {
  const onConfigured = jest.fn();
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <RiveGamePiece file={{} as never} isMine onConfigured={onConfigured} piece={Piece.Paper} size={80} />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(onConfigured).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.play.mock.invocationCallOrder[0]).toBeLessThan(
    onConfigured.mock.invocationCallOrder[0]!,
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

test('updates a tied combat weapon without resetting the prepared loser pose', async () => {
  const renderPiece = (piece: Piece, actionTrigger?: 'Attack Prepare' | 'Death') => (
    <RiveGamePiece
      actionTrigger={actionTrigger}
      file={{} as never}
      isMine
      piece={piece}
      preserveStateOnPieceChange
      size={80}
    />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(renderPiece(Piece.Rock, 'Attack Prepare'));
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.triggerInput).toHaveBeenCalledWith('Attack Prepare');

  await ReactTestRenderer.act(async () => {
    renderer.update(renderPiece(Piece.Paper));
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockRiveViewRef.setNumberInputValue).toHaveBeenCalledWith('Weapon', Piece.Paper);
  expect(mockRiveViewRef.pause).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    renderer.update(renderPiece(Piece.Paper, 'Death'));
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockRiveViewRef.triggerInput.mock.calls.map(([trigger]) => trigger)).toEqual([
    'Attack Prepare',
    'Death',
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

test('bootstraps Android playback while hidden before applying the weapon', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <RiveGamePiece file={{} as never} isMine piece={Piece.Paper} size={80} />,
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(2);
  expect(mockRiveViewRef.play.mock.invocationCallOrder[0]).toBeLessThan(
    mockRiveViewRef.setNumberInputValue.mock.invocationCallOrder[0]!,
  );
  expect(mockRiveViewRef.setNumberInputValue).toHaveBeenCalledWith('Weapon', Piece.Paper);
  const riveStyle = StyleSheet.flatten(renderer.root.findByType('RiveView' as never).props.style);
  expect(riveStyle.opacity).toBeUndefined();
});

test('keeps an iOS opponent hidden until its empty weapon state is playing', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  let resolvePlayback!: () => void;
  mockRiveViewRef.play.mockImplementationOnce(() => new Promise<void>(resolve => {
    resolvePlayback = resolve;
  }));
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <RiveGamePiece file={{} as never} isMine={false} piece={Piece.Empty} size={80} />,
    );
    await Promise.resolve();
  });

  expect(StyleSheet.flatten(renderer.root.findByType('RiveView' as never).props.style).opacity).toBe(0);
  expect(mockRiveViewRef.setNumberInputValue).toHaveBeenCalledWith('Weapon', Piece.Empty);

  await ReactTestRenderer.act(async () => {
    resolvePlayback();
    await Promise.resolve();
  });

  expect(StyleSheet.flatten(renderer.root.findByType('RiveView' as never).props.style).opacity).toBeUndefined();
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

test('mirrors only opponent figures so their weapon stays in the opposite hand', async () => {
  const renderPiece = (isMine: boolean) => (
    <RiveGamePiece file={{} as never} isMine={isMine} piece={Piece.Rock} size={80} />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(renderPiece(true));
    await Promise.resolve();
  });
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'rive-piece' }).props.style).transform).toBeUndefined();

  await ReactTestRenderer.act(async () => {
    renderer.update(renderPiece(false));
    await Promise.resolve();
  });
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'rive-piece' }).props.style).transform).toEqual([
    { scaleX: -1 },
  ]);
});
