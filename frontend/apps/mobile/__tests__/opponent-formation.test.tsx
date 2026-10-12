import React from 'react';
import Renderer from 'react-test-renderer';
import * as Rive from '@rive-app/react-native';
import { FigureVariant, HEIGHT, Owner, Phase, Piece, toIdx, WIDTH, type GameState } from '@rps/core';
import { GameBoard } from '../src/components/game-board';
import { RiveGamePiece } from '../src/components/rive-game-piece';

jest.mock('@rive-app/react-canvas', () => ({
  useRiveFile: ({ src }: { src: string }) => ({ riveFile: { src }, status: 'success' }),
}));
jest.mock('../../web/app/game/[id]/RpsFigure', () => ({
  __esModule: true,
  default: (props: object) => require('react').createElement('span', { ...props, 'data-testid': 'web-figure' }),
}));
jest.mock('../../web/app/game/[id]/game.module.css', () => ({}));
jest.mock('../../web/app/hooks/use-figure-catalog', () => ({ useFigureCatalog: () => [] }));
jest.mock('../../web/app/hooks/remote-figure-file', () => ({ RemoteFigureFile: () => null }));

// Exercise the actual web board under the existing React renderer. Dynamic
// loading keeps native TypeScript from pulling in browser-only declarations.
const WebGameBoard = require('../../web/app/game/[id]/GameBoard').GameBoard as typeof GameBoard;
const names = ['', 'fig1', 'fig2', 'bonk', 'jup', 'ore'];
const files = names.map((name, variant) => ({ variant, src: `/figures/${name}.riv` }));
let tree: Renderer.ReactTestRenderer;
beforeEach(() => {
  let loaded = 0;
  jest.spyOn(require('@rive-app/react-native') as typeof Rive, 'useRiveFile').mockImplementation(() => ({
    riveFile: files[1 + loaded++ % 5], isLoading: false, error: null,
  } as unknown as ReturnType<typeof Rive.useRiveFile>));
});
afterEach(async () => {
  if (tree) await Renderer.act(() => tree.unmount());
  jest.restoreAllMocks();
});

function emptyState(): GameState {
  return {
    gameId: 'abcdefgh', phase: Phase.Joined, p0: 'alice', p1: 'bob', isP1Turn: false,
    owners: Array(WIDTH * HEIGHT).fill(Owner.None), pieces: Array(WIDTH * HEIGHT).fill(Piece.Empty),
    figureVariants: Array(WIDTH * HEIGHT).fill(FigureVariant.Empty), live0: 0, live1: 0,
    attacker: 0, defender: 0, outcome: 0, playerChoice: 0, tiePending: false,
    tieFrom: { x: 0, y: 0 }, tieTo: { x: 0, y: 0 }, winner: null,
  };
}
function opponentLineup(state: GameState, isPlayer1: boolean, variants: number[]) {
  variants.forEach((variant, position) => {
    const displayX = position % WIDTH, displayY = Math.floor(position / WIDTH);
    const index = toIdx(isPlayer1 ? WIDTH - 1 - displayX : displayX, isPlayer1 ? HEIGHT - 1 - displayY : displayY);
    state.owners[index] = isPlayer1 ? Owner.P0 : Owner.P1;
    state.figureVariants![index] = variant;
    state.pieces[index] = Piece.Empty; // The snapshot conceals the real weapon.
  });
  state.phase = isPlayer1 ? Phase.LineupP0Set : Phase.LineupP1Set;
}
function board(platform: string, state: GameState, isPlayer1: boolean) {
  const Board = platform === 'native' ? GameBoard : WebGameBoard;
  return <Board state={state} ownOwner={isPlayer1 ? Owner.P1 : Owner.P0} isPlayer1={isPlayer1}
    selected={null} availableMoves={[]} interactionEnabled={false} showOpponentFormation={state.phase < Phase.Active}
    moveAnimation={null} combatAnimation={null} combatPhase={null} trapAnimation={null}
    onCellPress={() => undefined} onMoveActionTriggered={() => undefined} onTrapActionTriggered={() => undefined} />;
}
function figures(platform: string) {
  return platform === 'native'
    ? tree.root.findAllByType(RiveGamePiece).map(node => ({ src: node.props.file.src, own: node.props.isMine, weapon: node.props.piece }))
    : tree.root.findAllByProps({ 'data-testid': 'web-figure' }).map(node => ({ src: node.props.riveFile.src, own: node.props.isMyFigure, weapon: node.props.weapon }));
}

describe.each(['native', 'web'])('%s opponent figures', platform => {
  test.each([false, true])('stays empty until a real opponent lineup exists, then shows exact models (player 2: %s)', async isPlayer1 => {
    const state = emptyState();
    await Renderer.act(() => { tree = Renderer.create(board(platform, state, isPlayer1)); });
    expect(figures(platform)).toEqual([]);
    const variants = [5, 5, 4, 2, 3, 3, 1, 4, 1, 1, 5, 2, 1, 1];
    opponentLineup(state, isPlayer1, variants);
    await Renderer.act(() => tree.update(board(platform, state, isPlayer1)));
    expect(figures(platform)).toEqual(variants.map(variant => ({ src: files[variant]!.src, own: false, weapon: Piece.Empty })));
    // Starting the match does not replace cosmetics or disclose hidden weapons.
    state.phase = Phase.Active;
    await Renderer.act(() => tree.update(board(platform, state, isPlayer1)));
    expect(figures(platform)).toEqual(variants.map(variant => ({ src: files[variant]!.src, own: false, weapon: Piece.Empty })));
  });

  test('an all-starter opponent never acquires invented Seeker models', async () => {
    const state = emptyState();
    opponentLineup(state, false, Array(14).fill(FigureVariant.Fig1));
    await Renderer.act(() => { tree = Renderer.create(board(platform, state, false)); });
    expect(figures(platform)).toEqual(Array(14).fill({ src: files[1]!.src, own: false, weapon: Piece.Empty }));
  });
});
