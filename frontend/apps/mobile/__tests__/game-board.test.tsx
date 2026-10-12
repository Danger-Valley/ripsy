import React from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { FigureVariant, HEIGHT, Owner, Phase, Piece, toIdx, WIDTH, type GameState } from '@rps/core';
import { GameBoard } from '../src/components/game-board';
import { RiveGamePiece } from '../src/components/rive-game-piece';
import { colors } from '../src/theme';

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

test.each([false, true])('subtly highlights only the opponent destination in the static grid (reversed %s)', async isPlayer1 => {
  const state = createState();
  state.tieFrom = { x: 1, y: 0 };
  state.tieTo = { x: 1, y: 1 };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const render = (selected: { x: number; y: number } | null = null) => (
    <GameBoard state={state} ownOwner={Owner.P0} isPlayer1={isPlayer1} selected={selected} />
  );
  await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(render()); });
  const marker = renderer.root.findByProps({ testID: 'last-opponent-move-cell' });
  expect(renderer.root.findByProps({ testID: 'board-grid' }).findByProps({ testID: 'last-opponent-move-cell' })).toBe(marker);
  expect(StyleSheet.flatten(marker.props.style)).toMatchObject({ backgroundColor: colors.boardOpponentLastMove });
  const row = isPlayer1 ? HEIGHT - 1 : 2;
  const column = isPlayer1 ? WIDTH - 1 : 2;
  expect(renderer.root.find(node => node.props.accessibilityLabel === `Row ${row}, column ${column}, empty`).props.accessibilityHint)
    .toBe('Opponent last moved here');
  const figures = renderer.root.findAllByType(RiveGamePiece);
  await ReactTestRenderer.act(() => { renderer.update(render({ x: 1, y: 1 })); });
  const selected = renderer.root.find(node => node.props.accessibilityHint === 'Selected piece. Opponent last moved here');
  expect(StyleSheet.flatten(selected.props.style).backgroundColor).toBe(colors.rewardHighlight);
  expect(renderer.root.findAllByType(RiveGamePiece)).toEqual(figures);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('waits for the displayed opponent move and leaves legal-move styling and hit targets unchanged', async () => {
  const before = createState();
  before.isP1Turn = true;
  const from = { x: 1, y: 0 };
  const to = { x: 1, y: 1 };
  const move = { from, to, owner: Owner.P1, piece: Piece.Paper };
  const next = { ...before, isP1Turn: false, tieFrom: from, tieTo: to, owners: [...before.owners], pieces: [...before.pieces] };
  next.owners[toIdx(1, 0)] = Owner.None;
  next.pieces[toIdx(1, 0)] = Piece.Empty;
  next.owners[toIdx(1, 1)] = Owner.P1;
  next.pieces[toIdx(1, 1)] = Piece.Empty;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<GameBoard state={before} ownOwner={Owner.P0} isPlayer1={false}
      moveAnimation={move} moveProgress={new Animated.Value(0)} />);
  });
  expect(renderer.root.findAllByProps({ testID: 'last-opponent-move-cell' })).toHaveLength(0);
  await ReactTestRenderer.act(() => {
    renderer.update(<GameBoard state={next} ownOwner={Owner.P0} isPlayer1={false}
      selected={{ x: 0, y: 0 }} availableMoves={[to]} interactionEnabled onCellPress={() => undefined} />);
  });
  const target = renderer.root.find(node => node.props.accessibilityHint === 'Move selected piece here. Opponent last moved here');
  expect(target.props.accessibilityRole).toBe('button');
  expect(target.props.disabled).toBe(false);
  expect(StyleSheet.flatten(target.props.style).backgroundColor).toBe(colors.boardMove);
  expect(renderer.root.findByProps({ testID: 'last-opponent-move-cell' })).toBeDefined();
  await ReactTestRenderer.act(() => renderer.unmount());
});

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
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 10,
    borderWidth: 0,
    overflow: 'visible',
  });
  expect(pieceVisuals.every(visual => {
    const style = StyleSheet.flatten(visual.props.style);
    return style.backgroundColor === undefined && style.borderColor === undefined && style.borderWidth === undefined;
  })).toBe(true);
  const firstCellStyle = StyleSheet.flatten(cells[0]?.props.style);
  expect(firstCellStyle.width * WIDTH).toBeCloseTo(boardStyle.width * 0.84);
});

test('caps the complete board to the available height and keeps the grid and hit targets aligned', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<GameBoard maxSize={300} state={createState()} ownOwner={Owner.P0} isPlayer1 />);
  });
  const boardStyle = StyleSheet.flatten(renderer.root.findByProps({ testID: 'game-board' }).props.style);
  expect(boardStyle.width).toBe(300);
  expect(boardStyle.height).toBe(300);
  const cell = renderer.root.find(node => node.props.accessibilityLabel === 'Row 1, column 1, empty');
  const cellStyle = StyleSheet.flatten(cell.props.style);
  expect(cellStyle.width).toBe(cellStyle.height);
  expect(cellStyle.width * WIDTH).toBeCloseTo(300 * 0.84);
  const art = renderer.root.findAllByType(require('react-native').Image)[0]!;
  expect(art.parent?.props.pointerEvents).toBe('none');
  await ReactTestRenderer.act(() => renderer.unmount());
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

test('renders synchronized trap activation and falling victim Rive actions', async () => {
  const state = createState();
  state.owners.fill(Owner.None);
  state.pieces.fill(Piece.Empty);
  state.owners[toIdx(0, 4)] = Owner.P1;
  state.pieces[toIdx(0, 4)] = Piece.Trap;
  const onTrapActionTriggered = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  const renderBoard = (trapAnimationSequence: number) => (
    <GameBoard
      isPlayer1={false}
      onTrapActionTriggered={onTrapActionTriggered}
      ownOwner={Owner.P0}
      state={state}
      trapAnimation={{
        from: { x: 0, y: 5 },
        to: { x: 0, y: 4 },
        attackerOwner: Owner.P0,
        trapOwner: Owner.P1,
        attackerPiece: Piece.Rock,
      }}
      trapAnimationSequence={trapAnimationSequence}
    />
  );

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(renderBoard(1));
  });

  const trapScene = renderer.root.findByProps({ testID: 'trap-scene' });
  const trapSceneStyle = StyleSheet.flatten(trapScene.props.style);
  const trapCell = renderer.root.find(node => node.props.accessibilityLabel === 'Row 5, column 1, opponent piece');
  const trapCellStyle = StyleSheet.flatten(trapCell.props.style);
  expect(trapSceneStyle.zIndex).toBeGreaterThan(trapCellStyle.zIndex);
  expect(trapSceneStyle.elevation).toBeGreaterThan(trapCellStyle.elevation);
  const trapFigures = renderer.root.findAllByType(RiveGamePiece);
  expect(trapFigures).toHaveLength(2);
  expect(trapFigures.map(figure => figure.props.actionTrigger).sort()).toEqual([
    'Fall In Trap',
    'Trap Activate',
  ]);
  expect(trapFigures.find(figure => figure.props.actionTrigger === 'Trap Activate')?.props.piece).toBe(Piece.Trap);
  expect(trapFigures.find(figure => figure.props.actionTrigger === 'Fall In Trap')?.props.piece).toBe(Piece.Rock);
  const firstTrapFigure = trapFigures.find(figure => figure.props.actionTrigger === 'Trap Activate');
  const firstVictimFigure = trapFigures.find(figure => figure.props.actionTrigger === 'Fall In Trap');

  await ReactTestRenderer.act(() => {
    renderer.update(renderBoard(2));
  });

  const repeatedTrapFigures = renderer.root.findAllByType(RiveGamePiece);
  expect(repeatedTrapFigures.find(figure => figure.props.actionTrigger === 'Trap Activate')).not.toBe(
    firstTrapFigure,
  );
  const secondTrapFigure = repeatedTrapFigures.find(figure => figure.props.actionTrigger === 'Trap Activate');
  expect(repeatedTrapFigures.find(figure => figure.props.actionTrigger === 'Fall In Trap')).not.toBe(
    firstVictimFigure,
  );
  await ReactTestRenderer.act(() => {
    renderer.update(<GameBoard isPlayer1={false} ownOwner={Owner.P0} state={state} trapAnimationSequence={2} />);
  });
  const settledTrap = renderer.root.findAllByType(RiveGamePiece).find(figure => figure.props.piece === Piece.Trap);
  expect(settledTrap).toBe(secondTrapFigure);
  expect(settledTrap?.props.actionTrigger).toBeUndefined();
  expect(renderer.root.findAllByProps({ testID: 'trap-scene' })).toHaveLength(0);
  await ReactTestRenderer.act(() => renderer.unmount());
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

test('does not invent an opponent army before its lineup is submitted', async () => {
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
  expect(opponentCells).toHaveLength(0);
  expect(renderer.root.findAll(node => node.props.testID === 'rive-view')).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(230);
    await Promise.resolve();
  });

  expect(renderer.root.findAll(node => node.props.testID === 'rive-view')).toHaveLength(0);
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
  expect(renderer.root.findAllByType(RiveGamePiece).every(figure => figure.props.preserveStateOnPieceChange)).toBe(true);

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

test('keeps the local fighter left and the opponent right regardless of attacker position', async () => {
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
        ownOwner={Owner.P1}
        state={state}
      />,
    );
  });

  const cellSize = StyleSheet.flatten(renderer.root.find(
    node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Row 1, column 1,'),
  ).props.style).width;
  const fighters = renderer.root.findAll(node => node.props.testID === 'combat-winner' || node.props.testID === 'combat-loser');
  const localFighter = fighters.find(fighter => fighter.findByType(RiveGamePiece).props.isMine);
  const opponentFighter = fighters.find(fighter => !fighter.findByType(RiveGamePiece).props.isMine);
  expect(localFighter).toBeDefined();
  expect(opponentFighter).toBeDefined();
  const localStyle = StyleSheet.flatten(localFighter!.props.style);
  const opponentStyle = StyleSheet.flatten(opponentFighter!.props.style);
  const localFinalX = localStyle.left + localStyle.transform[0].translateX.__getValue();
  const opponentFinalX = opponentStyle.left + opponentStyle.transform[0].translateX.__getValue();

  expect(localFinalX).toBeLessThan(opponentFinalX);
  expect((opponentFinalX - localFinalX) / cellSize).toBeCloseTo(0.84);
  expect(localStyle.transform).toHaveLength(3);
  expect(opponentStyle.transform).toHaveLength(3);
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

  const cellSize = StyleSheet.flatten(renderer.root.find(
    node => node.props.accessibilityLabel === 'Row 1, column 1, empty',
  ).props.style).width;
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
    && StyleSheet.flatten(node.props.style)?.transform?.length === 3
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

test.each([false, true])('remounts shuffled figure models with local Back facing for player1=%s', async isPlayer1 => {
  const state = createState();
  state.phase = Phase.Created;
  state.owners.fill(Owner.None);
  state.pieces.fill(Piece.Empty);
  const ownOwner = isPlayer1 ? Owner.P1 : Owner.P0;
  const renderBoard = (figureVariant: FigureVariant) => (
    <GameBoard
      isPlayer1={isPlayer1}
      ownOwner={ownOwner}
      previewLineup={[{ x: isPlayer1 ? WIDTH - 1 : 0, y: isPlayer1 ? 0 : HEIGHT - 1, piece: Piece.Paper, figureVariant }]}
      showOpponentFormation
      state={state}
    />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(renderBoard(FigureVariant.Fig1)); });
  const localCell = () => renderer.root.find(node => node.props.accessibilityLabel === 'Row 7, column 1, your paper');
  let previousView = localCell().findByProps({ testID: 'rive-view' });
  for (const variant of [FigureVariant.Fig2, FigureVariant.Bonk, FigureVariant.Jup, FigureVariant.Ore, FigureVariant.Fig1, FigureVariant.Fig2]) {
    await ReactTestRenderer.act(() => { renderer.update(renderBoard(variant)); });
    const currentView = localCell().findByProps({ testID: 'rive-view' });
    expect(currentView).not.toBe(previousView);
    expect(currentView.props.stateMachineName).toBe('State Machine Back');
    previousView = currentView;
  }
  await ReactTestRenderer.act(() => { renderer.unmount(); });
});

test('keeps unaffected figures rendered through takeoff, landing and the next turn', async () => {
  const nativeRender = jest.spyOn(require('@rive-app/react-native'), 'RiveView');
  const previous = createState();
  previous.owners[toIdx(5, 6)] = Owner.P0;
  previous.pieces[toIdx(5, 6)] = Piece.Scissors;
  const next = { ...previous, owners: [...previous.owners], pieces: [...previous.pieces], isP1Turn: true };
  next.owners[toIdx(0, 0)] = Owner.None;
  next.pieces[toIdx(0, 0)] = Piece.Empty;
  next.owners[toIdx(0, 1)] = Owner.P0;
  next.pieces[toIdx(0, 1)] = Piece.Rock;
  const progress = new Animated.Value(0);
  const move = { from: { x: 0, y: 0 }, to: { x: 0, y: 1 }, owner: Owner.P0, piece: Piece.Rock };
  const renderBoard = (state: GameState, moving = false) => (
    <GameBoard isPlayer1={false} ownOwner={Owner.P0} state={state} moveAnimation={moving ? move : null} moveProgress={progress} />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(renderBoard(previous)); });
    const stationaryViews = () => [
      renderer.root.find(node => node.props.accessibilityLabel === 'Row 1, column 2, opponent piece').findByProps({ testID: 'rive-view' }),
      renderer.root.find(node => node.props.accessibilityLabel === 'Row 7, column 6, your scissors').findByProps({ testID: 'rive-view' }),
    ];
    const originalViews = stationaryViews();
    nativeRender.mockClear();
    await ReactTestRenderer.act(() => { renderer.update(renderBoard(previous, true)); });
    expect(nativeRender).toHaveBeenCalledTimes(1); // Only the moving source.
    nativeRender.mockClear();
    await ReactTestRenderer.act(() => { renderer.update(renderBoard(next, true)); });
    expect(nativeRender).toHaveBeenCalledTimes(1); // Only the new destination.
    nativeRender.mockClear();
    await ReactTestRenderer.act(() => { renderer.update(renderBoard(next)); });
    expect(nativeRender).not.toHaveBeenCalled();
    const currentViews = stationaryViews();
    expect(currentViews[0]).toBe(originalViews[0]);
    expect(currentViews[1]).toBe(originalViews[1]);
  } finally {
    await ReactTestRenderer.act(() => { renderer?.unmount(); });
    nativeRender.mockRestore();
  }
});
