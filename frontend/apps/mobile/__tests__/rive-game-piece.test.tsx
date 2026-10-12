import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { RiveView } from '@rive-app/react-native';
import { HEIGHT, Owner, Phase, Piece, WIDTH, type GameState } from '@rps/core';
import { RiveGamePiece, type RiveActionTrigger } from '../src/components/rive-game-piece';
import { GameBoard } from '../src/components/game-board';

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
const mockRiveFile = {} as never;
const mockCreateRiveViewRef = jest.fn(() => mockRiveViewRef);
let mockReportedRiveViewRef: typeof mockRiveViewRef | undefined;
const mockRenderRiveView = jest.fn();

jest.mock('@rive-app/react-native', () => {
  const ReactModule = require('react');
  return {
    Fit: { Contain: 'contain' },
    RiveView: (props: object) => {
      mockRenderRiveView(props);
      return ReactModule.createElement('RiveView', props);
    },
    useRive: () => {
      const [riveViewRef] = ReactModule.useState(() => mockCreateRiveViewRef());
      return { riveViewRef: mockReportedRiveViewRef ?? riveViewRef, setHybridRef: { f: () => undefined } };
    },
    useRiveFile: () => {
      const [riveFile] = ReactModule.useState(() => ({}));
      return { riveFile };
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateRiveViewRef.mockReset().mockReturnValue(mockRiveViewRef);
  mockReportedRiveViewRef = undefined;
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
      <RiveGamePiece file={mockRiveFile} isMine piece={Piece.Trap} size={80} />,
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
        file={mockRiveFile}
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
        file={mockRiveFile}
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

test('an in-place opponent trap reveal with an explicit collision does not also run initialization activation', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const callback = jest.fn();
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<RiveGamePiece file={mockRiveFile} isMine={false} piece={Piece.Empty} size={80} />);
  });
  mockRiveViewRef.triggerInput.mockClear();
  await ReactTestRenderer.act(async () => {
    renderer.update(<RiveGamePiece file={mockRiveFile} isMine={false} piece={Piece.Trap} size={80}
      actionTrigger="Trap Activate" onActionTriggered={callback} />);
  });
  expect(mockRiveViewRef.triggerInput.mock.calls).toEqual([['Trap Activate']]);
  expect(callback).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('callback changes and clearing an explicit trap action do not restart or reinitialize it', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const callback = jest.fn();
  const render = (active: boolean, onActionTriggered: (trigger: RiveActionTrigger) => void = callback) => (
    <RiveGamePiece file={mockRiveFile} isMine={false} piece={Piece.Trap} size={80}
      actionTrigger={active ? 'Trap Activate' : undefined} onActionTriggered={onActionTriggered} />
  );
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(render(true)); });
  const nativeView = renderer.root.findByType(RiveView);
  await ReactTestRenderer.act(async () => { renderer.update(render(true, trigger => callback(trigger))); });
  expect(mockRiveViewRef.triggerInput.mock.calls).toEqual([['Trap Activate']]);
  await ReactTestRenderer.act(async () => { renderer.update(render(false)); });
  expect(mockRiveViewRef.triggerInput.mock.calls).toEqual([['Trap Activate']]);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByType(RiveView)).toBe(nativeView);
  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.playIfNeeded).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test.each([
  ['ios', false], ['ios', true], ['android', false], ['android', true],
] as const)('board plays each trap collision once and retains the trap after settling: %s, local trap %s', async (platform, isMine) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
  const owners = Array<Owner>(WIDTH * HEIGHT).fill(Owner.None);
  const pieces = Array<Piece>(WIDTH * HEIGHT).fill(Piece.Empty);
  const trapOwner = isMine ? Owner.P0 : Owner.P1;
  owners[4 * WIDTH] = trapOwner;
  pieces[4 * WIDTH] = isMine ? Piece.Trap : Piece.Empty;
  const initial: GameState = {
    gameId: 'abcdef12', phase: Phase.Active, p0: 'alice', p1: 'bob', isP1Turn: false,
    owners, pieces, live0: 1, live1: 1, attacker: 0, defender: 0, outcome: 0,
    playerChoice: 0, tiePending: false, tieFrom: { x: 0, y: 0 }, tieTo: { x: 0, y: 0 }, winner: null,
  };
  const revealed = { ...initial, pieces: [...pieces] };
  revealed.pieces[4 * WIDTH] = Piece.Trap;
  const onTrigger = jest.fn();
  const render = (state: GameState, sequence: number, active: boolean) => (
    <GameBoard state={state} ownOwner={Owner.P0} isPlayer1={false} trapAnimationSequence={sequence}
      onTrapActionTriggered={onTrigger}
      trapAnimation={active ? { from: { x: 0, y: 5 }, to: { x: 0, y: 4 },
        attackerOwner: isMine ? Owner.P1 : Owner.P0, trapOwner, attackerPiece: Piece.Rock } : null} />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(render(initial, 0, false)); });
  let trapView = renderer.root.findByType(RiveView);
  let lastSequence = 0;
  mockRiveViewRef.triggerInput.mockClear();
  for (const [sequence, active, expected] of [[1, true, 1], [1, false, 1], [2, true, 2], [3, true, 3], [3, false, 3]] as const) {
    await ReactTestRenderer.act(async () => { renderer.update(render(revealed, sequence, active)); });
    expect(mockRiveViewRef.triggerInput.mock.calls.filter(([trigger]) => trigger === 'Trap Activate')).toHaveLength(expected);
    expect(mockRiveViewRef.triggerInput.mock.calls.filter(([trigger]) => trigger === 'Fall In Trap')).toHaveLength(expected);
    expect(onTrigger.mock.calls.filter(([trigger]) => trigger === 'Trap Activate')).toHaveLength(expected);
    const currentTrap = renderer.root.findAllByType(RiveGamePiece).find(figure => figure.props.piece === Piece.Trap)!;
    const currentView = currentTrap.findByType(RiveView);
    if (active && sequence !== lastSequence) {
      expect(currentView).not.toBe(trapView);
      lastSequence = sequence;
      trapView = currentView;
    } else {
      expect(currentView).toBe(trapView);
    }
  }
  expect(mockRiveViewRef.playIfNeeded).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('starts the falling victim animation after its weapon is configured', async () => {
  const onActionTriggered = jest.fn();
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <RiveGamePiece
        actionTrigger="Fall In Trap"
        file={mockRiveFile}
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
      <RiveGamePiece actionTrigger="Jump Right" file={mockRiveFile} isMine onActionTriggered={onActionTriggered} piece={Piece.Rock} size={80} />,
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
      <RiveGamePiece actionTrigger="Jump Right" file={mockRiveFile} isMine onActionTriggered={onActionTriggered} piece={Piece.Rock} size={80} />,
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
      <RiveGamePiece file={mockRiveFile} isMine onConfigured={onConfigured} piece={Piece.Paper} size={80} />,
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
    <RiveGamePiece actionTrigger={actionTrigger} file={mockRiveFile} isMine piece={Piece.Rock} size={80} />
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
      file={mockRiveFile}
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
      <RiveGamePiece file={mockRiveFile} isMine piece={Piece.Paper} size={80} />,
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

test('configures Android inputs before a single playback start using the patched paused machine', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <RiveGamePiece file={mockRiveFile} isMine piece={Piece.Paper} size={80} />,
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.setNumberInputValue.mock.invocationCallOrder[0]).toBeLessThan(
    mockRiveViewRef.play.mock.invocationCallOrder[0]!,
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
      <RiveGamePiece file={mockRiveFile} isMine={false} piece={Piece.Empty} size={80} />,
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

test('reapplies the hidden opponent weapon if cold playback replaces the initial input state', async () => {
  let nativeWeapon: Piece = Piece.Scissors;
  mockRiveViewRef.setNumberInputValue.mockImplementation((name: string, value: Piece) => {
    if (name === 'Weapon') nativeWeapon = value;
  });
  mockRiveViewRef.play.mockImplementationOnce(async () => { nativeWeapon = Piece.Scissors; });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<RiveGamePiece file={mockRiveFile} isMine={false} piece={Piece.Empty} size={80} />);
  });
  expect(renderer.root.findByType('RiveView' as never).props.stateMachineName).toBe('State Machine Front');
  expect(nativeWeapon).toBe(Piece.Empty);
  expect(StyleSheet.flatten(renderer.root.findByType('RiveView' as never).props.style).opacity).toBeUndefined();
  expect(mockRiveViewRef.reset).not.toHaveBeenCalled();
});

test('starts an opponent preview after a one-time random delay', async () => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);

  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <RiveGamePiece file={mockRiveFile} isMine={false} piece={Piece.Empty} size={80} staggerStart />,
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

test('shows the opponent before Save lineup even when the accessibility query never resolves', async () => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => new Promise(() => undefined));
  jest.spyOn(Math, 'random').mockReturnValue(0.5);

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <RiveGamePiece file={mockRiveFile} isMine={false} piece={Piece.Empty} size={80} staggerStart />,
    );
  });
  expect(renderer.root.findAllByType('RiveView' as never)).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(230);
    await Promise.resolve();
  });

  expect(renderer.root.findAllByType('RiveView' as never)).toHaveLength(1);
  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(1);
  expect(StyleSheet.flatten(renderer.root.findByType('RiveView' as never).props.style).opacity).toBeUndefined();
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('does not reset the Android front state machine for opponent figures', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <RiveGamePiece file={mockRiveFile} isMine={false} piece={Piece.Empty} size={80} />,
    );
    await Promise.resolve();
  });

  expect(mockRiveViewRef.reset).not.toHaveBeenCalled();
  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(1);
});

test('remounts with the front state machine when a figure becomes an opponent', async () => {
  const renderPiece = (isMine: boolean) => (
    <RiveGamePiece file={mockRiveFile} isMine={isMine} piece={Piece.Empty} size={80} />
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
    <RiveGamePiece file={mockRiveFile} isMine={isMine} piece={Piece.Rock} size={80} />
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

test.each([true, false])('reserves constant jump headroom without rescaling or restarting the %s-facing controller', async isMine => {
  const size = 80;
  const onActionTriggered = jest.fn();
  const renderPiece = (actionTrigger?: RiveActionTrigger) => (
    <RiveGamePiece actionTrigger={actionTrigger} file={mockRiveFile} isMine={isMine} onActionTriggered={onActionTriggered} piece={Piece.Rock} size={size} />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(renderPiece()); });
  const view = renderer.root.findByType('RiveView' as never);
  const wrapperStyle = StyleSheet.flatten(renderer.root.findByProps({ testID: 'rive-piece' }).props.style);
  const idleStyle = StyleSheet.flatten(view.props.style);
  expect(wrapperStyle).toMatchObject({ width: size, height: size, overflow: 'visible' });
  expect(idleStyle).toMatchObject({ position: 'absolute', left: 0, right: 0, top: -20, bottom: -20 });
  expect(view.props.fit).toBe('contain');
  // For both current square artboards, Contain remains width-limited with
  // an unchanged scale and center, but 25% extra native canvas on each side.
  const viewportWidth = size - idleStyle.left - idleStyle.right;
  const viewportHeight = size - idleStyle.top - idleStyle.bottom;
  expect(Math.min(viewportWidth, viewportHeight)).toBe(size);
  expect(idleStyle.top + viewportHeight / 2).toBe(size / 2);
  const resets = mockRiveViewRef.reset.mock.calls.length;
  const plays = mockRiveViewRef.play.mock.calls.length;
  for (const trigger of ['Jump Forward', 'Jump Left', 'Jump Right'] as const) {
    await ReactTestRenderer.act(async () => { renderer.update(renderPiece(trigger)); });
    expect(renderer.root.findByType('RiveView' as never)).toBe(view);
    expect(StyleSheet.flatten(view.props.style)).toEqual(idleStyle);
    await ReactTestRenderer.act(async () => { renderer.update(renderPiece(trigger)); });
    await ReactTestRenderer.act(async () => { renderer.update(renderPiece()); });
    expect(StyleSheet.flatten(view.props.style)).toEqual(idleStyle);
  }
  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(resets);
  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(plays);
  expect(mockRiveViewRef.triggerInput.mock.calls).toEqual([['Jump Forward'], ['Jump Left'], ['Jump Right']]);
  expect(onActionTriggered).toHaveBeenCalledTimes(3);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('waits for native reset completion before writing inputs or revealing the view', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  let completeReset!: () => void;
  mockRiveViewRef.reset.mockImplementationOnce(() => new Promise<void>(resolve => { completeReset = resolve; }));
  const onConfigured = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<RiveGamePiece file={mockRiveFile} isMine onConfigured={onConfigured} piece={Piece.Rock} size={80} />);
  });
  expect(mockRiveViewRef.setNumberInputValue).not.toHaveBeenCalled();
  expect(mockRiveViewRef.play).not.toHaveBeenCalled();
  expect(onConfigured).not.toHaveBeenCalled();
  expect(StyleSheet.flatten(renderer.root.findByType('RiveView' as never).props.style).opacity).toBe(0);
  await ReactTestRenderer.act(async () => { completeReset(); });
  expect(mockRiveViewRef.setNumberInputValue).toHaveBeenCalledWith('Weapon', Piece.Rock);
  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(1);
  expect(onConfigured).toHaveBeenCalledTimes(1);
});

test.each(['input', 'playback'] as const)('does not reveal or trigger a default figure after a required %s failure', async failure => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  if (failure === 'input') mockRiveViewRef.setNumberInputValue.mockImplementationOnce(() => { throw new Error('native not configured'); });
  else mockRiveViewRef.play.mockRejectedValueOnce(new Error('native playback failed'));
  const onConfigured = jest.fn();
  const onActionTriggered = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<RiveGamePiece actionTrigger="Jump Forward" file={mockRiveFile} isMine onActionTriggered={onActionTriggered} onConfigured={onConfigured} piece={Piece.Paper} size={80} />);
  });
  expect(StyleSheet.flatten(renderer.root.findByType('RiveView' as never).props.style).opacity).toBe(0);
  expect(onConfigured).not.toHaveBeenCalled();
  expect(onActionTriggered).not.toHaveBeenCalled();
  expect(mockRiveViewRef.triggerInput).not.toHaveBeenCalled();
  expect(mockRiveViewRef.playIfNeeded).not.toHaveBeenCalled();
  expect(warning).toHaveBeenCalledWith('Rive figure initialization failed');
});

test('reapplies the weapon when the Rive asset changes even if the piece type is unchanged', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const figure2 = {} as never;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<RiveGamePiece file={mockRiveFile} isMine piece={Piece.Paper} preserveStateOnPieceChange size={80} />);
  });
  const originalView = renderer.root.findByType('RiveView' as never);
  await ReactTestRenderer.act(async () => {
    renderer.update(<RiveGamePiece file={figure2} isMine piece={Piece.Paper} preserveStateOnPieceChange size={80} />);
  });
  expect(renderer.root.findByType('RiveView' as never)).not.toBe(originalView);
  expect(renderer.root.findByType('RiveView' as never).props.stateMachineName).toBe('State Machine Back');
  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(2);
  expect(mockRiveViewRef.setNumberInputValue.mock.calls.filter(([name]) => name === 'Weapon')).toEqual([
    ['Weapon', Piece.Paper], ['Weapon', Piece.Paper], ['Weapon', Piece.Paper], ['Weapon', Piece.Paper],
  ]);
});

test('isolates a shuffled Seeker instance from unfinished playback on the previous asset', async () => {
  let finishOldPlayback!: () => void;
  const oldView = {
    ...mockRiveViewRef,
    play: jest.fn(() => new Promise<void>(resolve => { finishOldPlayback = resolve; })),
  };
  const seekerView = { ...mockRiveViewRef, play: jest.fn(() => Promise.resolve()) };
  mockCreateRiveViewRef.mockReturnValueOnce(oldView).mockReturnValueOnce(seekerView);
  const seekerFile = {} as never;
  const onConfigured = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<RiveGamePiece file={mockRiveFile} isMine onConfigured={onConfigured} piece={Piece.Rock} size={80} />);
  });
  await ReactTestRenderer.act(async () => {
    renderer.update(<RiveGamePiece file={seekerFile} isMine onConfigured={onConfigured} piece={Piece.Rock} size={80} />);
  });
  expect(mockCreateRiveViewRef).toHaveBeenCalledTimes(2);
  expect(seekerView.play).toHaveBeenCalledTimes(1);
  expect(onConfigured).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByType('RiveView' as never).props.stateMachineName).toBe('State Machine Back');
  await ReactTestRenderer.act(async () => { finishOldPlayback(); });
  expect(onConfigured).toHaveBeenCalledTimes(1);
  expect(oldView.play).toHaveBeenCalledTimes(1);
});

test('serializes rapid shuffle resets so an old reset cannot overwrite the newest lineup', async () => {
  let finishOldReset!: () => void;
  mockRiveViewRef.reset.mockImplementationOnce(() => new Promise<void>(resolve => { finishOldReset = resolve; }));
  const onConfigured = jest.fn();
  const renderPiece = (piece: Piece) => <RiveGamePiece file={mockRiveFile} isMine onConfigured={onConfigured} piece={piece} size={80} />;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(renderPiece(Piece.Rock)); });
  await ReactTestRenderer.act(async () => { renderer.update(renderPiece(Piece.Paper)); });
  await ReactTestRenderer.act(async () => { renderer.update(renderPiece(Piece.Scissors)); });
  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.play).not.toHaveBeenCalled();
  expect(onConfigured).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { finishOldReset(); });
  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(2);
  expect(mockRiveViewRef.setNumberInputValue.mock.calls.filter(([name]) => name === 'Weapon')).toEqual([
    ['Weapon', Piece.Scissors], ['Weapon', Piece.Scissors],
  ]);
  expect(onConfigured).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(1);
});

test('does not hide or reset a configured figure when Nitro reports a new wrapper for the same native view', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const onConfigured = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<RiveGamePiece file={mockRiveFile} isMine onConfigured={onConfigured} piece={Piece.Paper} size={80} />);
  });
  const nativeView = renderer.root.findByType('RiveView' as never);
  mockReportedRiveViewRef = {
    ...mockRiveViewRef,
    equals: (other: unknown) => other === mockRiveViewRef,
  } as typeof mockRiveViewRef;
  // A size/layout update forces an actual render, so memo alone cannot mask
  // the duplicate native wrapper. No configuration should run again.
  await ReactTestRenderer.act(async () => {
    renderer.update(<RiveGamePiece file={mockRiveFile} isMine onConfigured={onConfigured} piece={Piece.Paper} size={90} />);
  });
  expect(renderer.root.findByType('RiveView' as never)).toBe(nativeView);
  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.pause).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(1);
  expect(onConfigured).toHaveBeenCalledTimes(1);
  expect(StyleSheet.flatten(nativeView.props.style).opacity).toBeUndefined();
});

test('does not rerender the native Rive view on unrelated board updates', async () => {
  const renderPiece = () => <RiveGamePiece file={mockRiveFile} isMine piece={Piece.Rock} size={80} />;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(renderPiece()); });
  mockRenderRiveView.mockClear();
  for (let update = 0; update < 5; update++) {
    await ReactTestRenderer.act(async () => { renderer.update(renderPiece()); });
  }
  expect(mockRenderRiveView).not.toHaveBeenCalled();
  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(1);
});

test('fires Jump once without reinitializing when the reported native wrapper changes during a move', async () => {
  const onActionTriggered = jest.fn();
  const renderPiece = (actionTrigger?: 'Jump Right') => (
    <RiveGamePiece actionTrigger={actionTrigger} file={mockRiveFile} isMine onActionTriggered={onActionTriggered} piece={Piece.Rock} size={80} />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(renderPiece()); });
  mockReportedRiveViewRef = {
    ...mockRiveViewRef,
    equals: (other: unknown) => other === mockRiveViewRef,
  } as typeof mockRiveViewRef;
  await ReactTestRenderer.act(async () => { renderer.update(renderPiece('Jump Right')); });
  await ReactTestRenderer.act(async () => { renderer.update(renderPiece('Jump Right')); });
  expect(mockRiveViewRef.triggerInput).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.triggerInput).toHaveBeenCalledWith('Jump Right');
  expect(onActionTriggered).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(1);
});

test('still configures a genuinely replaced native view instead of treating it as the old one', async () => {
  const onConfigured = jest.fn();
  const renderPiece = (size: number) => <RiveGamePiece file={mockRiveFile} isMine onConfigured={onConfigured} piece={Piece.Rock} size={size} />;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(renderPiece(80)); });
  const replacement = {
    ...mockRiveViewRef,
    equals: () => false,
    reset: jest.fn(() => Promise.resolve()),
  };
  mockReportedRiveViewRef = replacement;
  await ReactTestRenderer.act(async () => { renderer.update(renderPiece(90)); });
  expect(replacement.reset).toHaveBeenCalledTimes(1);
  expect(onConfigured).toHaveBeenCalledTimes(2);
});

test.each([true, false])('updates shuffled weapons in place without hiding or restarting the %s-facing figure', async isMine => {
  const view = {
    ...mockRiveViewRef,
    pause: jest.fn(() => Promise.resolve()),
    reset: jest.fn(() => Promise.resolve()),
    play: jest.fn(() => Promise.resolve()),
    setNumberInputValue: jest.fn(),
    triggerInput: jest.fn(),
  };
  mockCreateRiveViewRef.mockReturnValue(view);
  const renderPiece = (piece: Piece) => <RiveGamePiece file={mockRiveFile} isMine={isMine} piece={piece} size={80} />;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(renderPiece(Piece.Rock)); });
  const nativeView = renderer.root.findByType('RiveView' as never);
  const initialResets = view.reset.mock.calls.length;
  const initialPauses = view.pause.mock.calls.length;
  mockRenderRiveView.mockClear();
  for (const piece of [Piece.Paper, Piece.Scissors, Piece.Flag, Piece.Empty, Piece.Rock]) {
    await ReactTestRenderer.act(async () => { renderer.update(renderPiece(piece)); });
    expect(renderer.root.findByType('RiveView' as never)).toBe(nativeView);
    expect(StyleSheet.flatten(nativeView.props.style).opacity).toBeUndefined();
    expect(view.setNumberInputValue).toHaveBeenLastCalledWith(
      isMine ? 'WeaponVisible' : 'Weapon', isMine ? (piece === Piece.Empty ? 0 : 1) : piece,
    );
  }
  // Check every intermediate render, not just the final opacity.
  expect(mockRenderRiveView.mock.calls.every(([props]) => StyleSheet.flatten(props.style).opacity !== 0)).toBe(true);
  expect(view.pause).toHaveBeenCalledTimes(initialPauses);
  expect(view.reset).toHaveBeenCalledTimes(initialResets);
  expect(view.play).toHaveBeenCalledTimes(1);
  expect(view.triggerInput).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('enters a shuffled trap in place but resets its terminal trap pose before returning to a fighter', async () => {
  const renderPiece = (piece: Piece) => <RiveGamePiece file={mockRiveFile} isMine piece={piece} size={80} />;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(renderPiece(Piece.Paper)); });
  const view = renderer.root.findByType('RiveView' as never);
  await ReactTestRenderer.act(async () => { renderer.update(renderPiece(Piece.Trap)); });
  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(1);
  expect(mockRiveViewRef.triggerInput).toHaveBeenCalledWith('Trap Idle');
  expect(mockRiveViewRef.setNumberInputValue).toHaveBeenLastCalledWith('WeaponVisible', 0);
  expect(StyleSheet.flatten(view.props.style).opacity).toBeUndefined();
  await ReactTestRenderer.act(async () => { renderer.update(renderPiece(Piece.Scissors)); });
  expect(renderer.root.findByType('RiveView' as never)).toBe(view);
  expect(mockRiveViewRef.reset).toHaveBeenCalledTimes(2);
  expect(mockRiveViewRef.setNumberInputValue).toHaveBeenCalledWith('Weapon', Piece.Scissors);
  expect(mockRiveViewRef.play).toHaveBeenCalledTimes(2);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});
