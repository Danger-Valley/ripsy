import React from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { HEIGHT, Owner, Phase, Piece, toIdx, WIDTH, type GameState } from '@rps/core';
import { GameBoard } from '../src/components/game-board';
import { RiveGamePiece } from '../src/components/rive-game-piece';

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
  const boardStyle = StyleSheet.flatten(renderer.root.findByProps({ testID: 'game-board' }).props.style);
  const surfaceStyle = StyleSheet.flatten(renderer.root.findByProps({ testID: 'board-surface' }).props.style);
  expect(boardStyle.overflow).toBe('visible');
  expect(surfaceStyle).toMatchObject({
    borderColor: '#45A29E',
    borderRadius: 10,
    borderWidth: 2,
    overflow: 'hidden',
  });
  expect(pieceVisuals.every(visual => {
    const style = StyleSheet.flatten(visual.props.style);
    return style.backgroundColor === undefined && style.borderColor === undefined && style.borderWidth === undefined;
  })).toBe(true);
  const firstCellStyle = StyleSheet.flatten(cells[0]?.props.style);
  expect(firstCellStyle.width * WIDTH + surfaceStyle.borderWidth * 2).toBeCloseTo(boardStyle.width);
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

test('does not make traps selectable during an active turn', async () => {
  const state = createState();
  state.owners[toIdx(2, 0)] = Owner.P0;
  state.pieces[toIdx(2, 0)] = Piece.Trap;
  const onCellPress = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GameBoard
        interactionEnabled
        isPlayer1={false}
        onCellPress={onCellPress}
        ownOwner={Owner.P0}
        state={state}
      />,
    );
  });

  const trapCell = renderer.root.find(node => node.props.accessibilityLabel === 'Row 1, column 3, your trap');
  expect(trapCell.props).toMatchObject({ accessibilityRole: 'text', disabled: true });
  expect(trapCell.props.accessibilityHint).toBeUndefined();
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

test('keeps the opponent front-facing when the local player is player 2', async () => {
  const state = createState();
  state.phase = Phase.Joined;
  state.owners.fill(Owner.None);
  state.pieces.fill(Piece.Empty);
  state.owners[toIdx(0, HEIGHT - 1)] = Owner.P0;
  state.pieces[toIdx(0, HEIGHT - 1)] = Piece.Empty;

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GameBoard
        isPlayer1
        ownOwner={Owner.P1}
        previewLineup={[{ x: WIDTH - 1, y: 0, piece: Piece.Scissors }]}
        state={state}
      />,
    );
  });

  const figures = renderer.root.findAll(node => node.props.testID === 'rive-view');
  expect(figures.map(figure => figure.props.stateMachineName)).toEqual([
    'State Machine Front',
    'State Machine Back',
  ]);
});

test('fires a Rive jump on the already configured moving figure', async () => {
  const state = createState();
  const onMoveActionTriggered = jest.fn();
  const progress = new Animated.Value(0);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GameBoard
        isPlayer1={false}
        moveAnimation={{
          from: { x: 0, y: 0 },
          to: { x: 0, y: 1 },
          owner: Owner.P0,
          piece: Piece.Rock,
        }}
        moveProgress={progress}
        onMoveActionTriggered={onMoveActionTriggered}
        ownOwner={Owner.P0}
        state={state}
      />,
    );
  });

  const sourceCell = renderer.root.find(node => node.props.accessibilityLabel === 'Row 1, column 1, your rock');
  expect(sourceCell.findAll(node => node.props.testID === 'rive-view')).toHaveLength(1);
  expect(renderer.root.findAll(node => node.props.testID === 'rive-view')).toHaveLength(2);
  expect(sourceCell.findByType(RiveGamePiece).props.actionTrigger).toBe('Jump Forward');
  sourceCell.findByType(RiveGamePiece).props.onActionTriggered('Jump Forward');
  expect(onMoveActionTriggered).toHaveBeenCalledWith(100);

  const pieceStyle = StyleSheet.flatten(sourceCell.find(node => node.props.testID === 'piece-visual').props.style);
  expect(pieceStyle).toMatchObject({ zIndex: 21, elevation: 21 });
  expect(StyleSheet.flatten(sourceCell.props.style)).toMatchObject({ zIndex: 20, elevation: 20, overflow: 'visible' });
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'moving-source-row' }).props.style)).toMatchObject({
    zIndex: 19,
    elevation: 19,
    overflow: 'visible',
  });
  expect(StyleSheet.flatten(sourceCell.props.style).backgroundColor).toBeUndefined();
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'board-grid' }).props.style).position).toBe('absolute');
  const translateY = pieceStyle.transform[1].translateY;
  await ReactTestRenderer.act(() => {
    progress.setValue(0.48);
  });
  expect(translateY.__getValue()).toBeLessThan(0);
});

test('keeps an opponent moving down the board above later rows', async () => {
  const state = createState();
  state.owners.fill(Owner.None);
  state.pieces.fill(Piece.Empty);
  state.owners[toIdx(0, 1)] = Owner.P1;
  state.pieces[toIdx(0, 1)] = Piece.Empty;
  const progress = new Animated.Value(0.6);
  const onMoveActionTriggered = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GameBoard
        isPlayer1={false}
        moveAnimation={{
          from: { x: 0, y: 1 },
          to: { x: 0, y: 2 },
          owner: Owner.P1,
          piece: Piece.Empty,
        }}
        moveProgress={progress}
        onMoveActionTriggered={onMoveActionTriggered}
        ownOwner={Owner.P0}
        state={state}
      />,
    );
  });

  const sourceCell = renderer.root.find(node => node.props.accessibilityLabel === 'Row 2, column 1, opponent piece');
  expect(StyleSheet.flatten(sourceCell.props.style)).toMatchObject({ zIndex: 20, elevation: 20, overflow: 'visible' });
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'moving-source-row' }).props.style)).toMatchObject({
    zIndex: 19,
    elevation: 19,
    overflow: 'visible',
  });
  expect(StyleSheet.flatten(sourceCell.props.style).backgroundColor).toBeUndefined();
  expect(sourceCell.findByType(RiveGamePiece).props.actionTrigger).toBe('Jump Forward');
  sourceCell.findByType(RiveGamePiece).props.onActionTriggered('Jump Forward');
  expect(onMoveActionTriggered).toHaveBeenCalledWith(100);
});

test('keeps the landed source visible while the destination Rive instance preloads', async () => {
  const previous = createState();
  const next: GameState = {
    ...previous,
    owners: [...previous.owners],
    pieces: [...previous.pieces],
  };
  next.owners[toIdx(0, 0)] = Owner.None;
  next.pieces[toIdx(0, 0)] = Piece.Empty;
  next.owners[toIdx(0, 1)] = Owner.P0;
  next.pieces[toIdx(0, 1)] = Piece.Rock;
  const moveAnimation = {
    from: { x: 0, y: 0 },
    to: { x: 0, y: 1 },
    owner: Owner.P0,
    piece: Piece.Rock,
  };
  const onMoveDestinationReady = jest.fn();
  const progress = new Animated.Value(1);
  const renderBoard = (state: GameState, move: typeof moveAnimation | null = moveAnimation) => (
    <GameBoard
      isPlayer1={false}
      moveAnimation={move}
      moveProgress={progress}
      onMoveDestinationReady={onMoveDestinationReady}
      ownOwner={Owner.P0}
      state={state}
    />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(renderBoard(previous));
  });
  const movingInstance = renderer.root
    .find(node => node.props.accessibilityLabel === 'Row 1, column 1, your rock')
    .findByType(RiveGamePiece);

  await ReactTestRenderer.act(() => {
    renderer.update(renderBoard(next));
  });

  const sourceCell = renderer.root.find(node => node.props.accessibilityLabel === 'Row 1, column 1, your rock');
  const destinationCell = renderer.root.find(node => node.props.accessibilityLabel === 'Row 2, column 1, your rock');
  expect(sourceCell.findByType(RiveGamePiece)).toBe(movingInstance);
  expect(StyleSheet.flatten(destinationCell.find(node => node.props.testID === 'piece-visual').props.style).opacity).toBe(0);
  expect(destinationCell.findByType(RiveGamePiece).props.onConfigured).toBe(onMoveDestinationReady);

  await ReactTestRenderer.act(() => {
    renderer.update(renderBoard(next, null));
  });

  expect(renderer.root.find(node => node.props.accessibilityLabel === 'Row 1, column 1, empty').findAllByType(RiveGamePiece)).toHaveLength(0);
  expect(StyleSheet.flatten(
    renderer.root
      .find(node => node.props.accessibilityLabel === 'Row 2, column 1, your rock')
      .find(node => node.props.testID === 'piece-visual').props.style,
  ).opacity).toBeUndefined();
});

test('maps mounted horizontal jump animation to the player-visible direction', async () => {
  const state = createState();
  const progress = new Animated.Value(0);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GameBoard
        isPlayer1
        moveAnimation={{
          from: { x: 0, y: 0 },
          to: { x: 1, y: 0 },
          owner: Owner.P0,
          piece: Piece.Rock,
        }}
        moveProgress={progress}
        ownOwner={Owner.P1}
        state={state}
      />,
    );
  });

  const sourceCell = renderer.root.find(node => node.props.accessibilityLabel === 'Row 7, column 7, opponent piece');
  const pieceStyle = StyleSheet.flatten(sourceCell.find(node => node.props.testID === 'piece-visual').props.style);
  const translateX = pieceStyle.transform[0].translateX;
  await ReactTestRenderer.act(() => {
    progress.setValue(0.1);
  });
  expect(translateX.__getValue()).toBeLessThan(0);
  await ReactTestRenderer.act(() => {
    progress.setValue(1);
  });
  expect(translateX.__getValue()).toBeLessThan(0);
  expect(sourceCell.findByType(RiveGamePiece).props.actionTrigger).toBe('Jump Left');
});

test('stages a battle and sends the attack and death triggers to the right fighters', async () => {
  const state = createState();
  const combat = {
    resolution: 'resolved' as const,
    from: { x: 0, y: 0 },
    to: { x: 1, y: 0 },
    attackerOwner: Owner.P0,
    defenderOwner: Owner.P1,
    attackerPiece: Piece.Rock,
    defenderPiece: Piece.Paper,
    winnerOwner: Owner.P1,
    winnerPiece: Piece.Paper,
  };
  const progress = new Animated.Value(0);
  const renderBoard = (combatPhase: 'prepare' | 'attack' | 'death') => (
    <GameBoard
      combatAnimation={combat}
      combatPhase={combatPhase}
      isPlayer1={false}
      moveProgress={progress}
      ownOwner={Owner.P0}
      state={state}
    />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(renderBoard('prepare'));
  });
  expect(renderer.root.findAllByType(RiveGamePiece).map(figure => figure.props.actionTrigger)).toEqual([
    'Attack Prepare',
    'Attack Prepare',
  ]);

  await ReactTestRenderer.act(() => {
    renderer.update(renderBoard('attack'));
  });
  expect(renderer.root.findAllByType(RiveGamePiece).find(figure => figure.props.piece === Piece.Paper)?.props.actionTrigger).toBe('Attack');
  expect(renderer.root.findAllByType(RiveGamePiece).find(figure => figure.props.piece === Piece.Rock)?.props.actionTrigger).toBeUndefined();

  await ReactTestRenderer.act(() => {
    renderer.update(renderBoard('death'));
  });
  expect(renderer.root.findAllByType(RiveGamePiece).find(figure => figure.props.piece === Piece.Rock)?.props.actionTrigger).toBe('Death');
  expect(renderer.root.findAllByType(RiveGamePiece).find(figure => figure.props.piece === Piece.Paper)?.props.actionTrigger).toBeUndefined();
});

test('keeps enlarged combatants visibly separated around the fight midpoint', async () => {
  const state = createState();
  const progress = new Animated.Value(1.35);
  const combat = {
    resolution: 'resolved' as const,
    from: { x: 0, y: 0 },
    to: { x: 1, y: 0 },
    attackerOwner: Owner.P0,
    defenderOwner: Owner.P1,
    attackerPiece: Piece.Rock,
    defenderPiece: Piece.Paper,
    winnerOwner: Owner.P1,
    winnerPiece: Piece.Paper,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GameBoard
        combatAnimation={combat}
        combatPhase="attack"
        isPlayer1={false}
        moveProgress={progress}
        ownOwner={Owner.P0}
        state={state}
      />,
    );
  });

  const boardStyle = StyleSheet.flatten(renderer.root.findByProps({ testID: 'game-board' }).props.style);
  const surfaceStyle = StyleSheet.flatten(renderer.root.findByProps({ testID: 'board-surface' }).props.style);
  const cellSize = (boardStyle.width - surfaceStyle.borderWidth * 2) / WIDTH;
  const leftFighterStyle = StyleSheet.flatten(renderer.root.findByProps({ testID: 'combat-loser' }).props.style);
  const rightFighterStyle = StyleSheet.flatten(renderer.root.findByProps({ testID: 'combat-winner' }).props.style);
  const leftFinalX = leftFighterStyle.left + leftFighterStyle.transform[0].translateX.__getValue();
  const rightFinalX = rightFighterStyle.left + rightFighterStyle.transform[0].translateX.__getValue();

  expect((rightFinalX - leftFinalX) / cellSize).toBeCloseTo(0.84);
});

test('returns the combat winner into the destination cell before revealing the authoritative piece', async () => {
  const state = createState();
  state.owners[toIdx(0, 0)] = Owner.None;
  state.pieces[toIdx(0, 0)] = Piece.Empty;
  state.owners[toIdx(1, 0)] = Owner.P0;
  state.pieces[toIdx(1, 0)] = Piece.Rock;
  const progress = new Animated.Value(4);
  const combat = {
    resolution: 'resolved' as const,
    from: { x: 0, y: 0 },
    to: { x: 1, y: 0 },
    attackerOwner: Owner.P0,
    defenderOwner: Owner.P1,
    attackerPiece: Piece.Rock,
    defenderPiece: Piece.Scissors,
    winnerOwner: Owner.P0,
    winnerPiece: Piece.Rock,
  };
  const renderBoard = (showCombat: boolean) => (
    <GameBoard
      combatAnimation={showCombat ? combat : null}
      combatPhase={showCombat ? 'settle' : null}
      isPlayer1={false}
      moveProgress={progress}
      ownOwner={Owner.P0}
      state={state}
    />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(renderBoard(true));
  });

  const boardStyle = StyleSheet.flatten(renderer.root.findByProps({ testID: 'game-board' }).props.style);
  const surfaceStyle = StyleSheet.flatten(renderer.root.findByProps({ testID: 'board-surface' }).props.style);
  const cellSize = (boardStyle.width - surfaceStyle.borderWidth * 2) / WIDTH;
  const winnerStyle = StyleSheet.flatten(renderer.root.findByProps({ testID: 'combat-winner' }).props.style);
  const landedX = winnerStyle.left + winnerStyle.transform[0].translateX.__getValue();
  const landedY = winnerStyle.top + winnerStyle.transform[1].translateY.__getValue();
  const destinationCell = renderer.root.find(node => node.props.accessibilityLabel === 'Row 1, column 2, your rock');
  const destinationVisual = destinationCell.find(node => node.props.testID === 'piece-visual');
  const preloadedDestination = destinationCell.findByType(RiveGamePiece);

  expect(landedX).toBeCloseTo(cellSize);
  expect(landedY).toBeCloseTo(0);
  expect(winnerStyle.transform[2].scale.__getValue()).toBe(1);
  expect(winnerStyle.opacity.__getValue()).toBe(1);
  expect(StyleSheet.flatten(destinationVisual.props.style).opacity).toBe(0);

  await ReactTestRenderer.act(() => {
    renderer.update(renderBoard(false));
  });

  const revealedDestination = renderer.root
    .find(node => node.props.accessibilityLabel === 'Row 1, column 2, your rock')
    .findByType(RiveGamePiece);
  expect(revealedDestination).toBe(preloadedDestination);
  expect(StyleSheet.flatten(
    renderer.root
      .find(node => node.props.accessibilityLabel === 'Row 1, column 2, your rock')
      .find(node => node.props.testID === 'piece-visual').props.style,
  ).opacity).toBeUndefined();
});

test('holds both tied fighters enlarged without firing attack or death', async () => {
  const state = createState();
  const progress = new Animated.Value(1.35);
  const combat = {
    resolution: 'pending' as const,
    from: { x: 0, y: 0 },
    to: { x: 1, y: 0 },
    attackerOwner: Owner.P0,
    defenderOwner: Owner.P1,
    attackerPiece: Piece.Rock,
    defenderPiece: Piece.Rock,
    winnerOwner: null,
    winnerPiece: Piece.Empty,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GameBoard
        combatAnimation={combat}
        combatPhase="hold"
        isPlayer1={false}
        moveProgress={progress}
        ownOwner={Owner.P0}
        state={state}
      />,
    );
  });

  expect(renderer.root.findAllByType(RiveGamePiece)).toHaveLength(2);
  expect(renderer.root.findAllByType(RiveGamePiece).every(figure => figure.props.actionTrigger === undefined)).toBe(true);
  const fighters = renderer.root.findAll(node => (
    node.props.testID === 'combat-loser'
    && StyleSheet.flatten(node.props.style)?.transform?.length === 4
  ));
  expect(fighters.length).toBeGreaterThanOrEqual(2);
  const enlargedFighters = fighters.filter(fighter => {
    const scale = StyleSheet.flatten(fighter.props.style).transform[2].scale;
    return scale === 2 || scale.__getValue?.() === 2;
  });
  expect(enlargedFighters.length).toBeGreaterThanOrEqual(2);
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
