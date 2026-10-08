import React from 'react';
import Renderer from 'react-test-renderer';
import { NativeModules, Text } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { ShopClient } from '@rps/game-client/shop';
import { FIGURES } from '@rps/core/shop';
import type { FigureDefinition } from '@rps/core/figure-manifest';
import { Owner, Phase, Piece, type GameState } from '@rps/core';
import * as catalog from '../src/figures/catalog';
import { cacheFigureAnimation } from '../src/figures/asset-cache';
import { GameBoard } from '../src/components/game-board';
import { RiveGamePiece } from '../src/components/rive-game-piece';
import { bundledHashes } from '../src/figures/remote-animation';

jest.mock('@rps/game-client/shop', () => ({ ShopClient: jest.fn() }));
const definitions: FigureDefinition[] = FIGURES.map(f => ({ ...f, imageUrl: `https://www.ripsy.fun/${f.id}.png`, animation: { url: `https://www.ripsy.fun/${f.id}.riv`, sha256: bundledHashes[f.variant], bytes: 500, contract: 1 } }));
const future: FigureDefinition = { ...definitions[2], id: 'future-fighter', variant: 42, name: 'Future fighter', imageUrl: 'https://www.ripsy.fun/future.png', animation: { ...definitions[2].animation, sha256: 'a'.repeat(64), url: 'https://www.ripsy.fun/future.riv' } };
const getCatalog = jest.fn();
beforeEach(() => { jest.mocked(ShopClient).mockImplementation(() => ({ figures: getCatalog } as unknown as ShopClient)); });
afterEach(() => jest.restoreAllMocks());

test('server definitions are cached, unknown portraits work, no-op refresh retains identities, remapping is rejected', async () => {
  getCatalog.mockResolvedValue({ schema: 1, figures: [...definitions, future] });
  let snapshot!: ReturnType<typeof catalog.useFigureCatalog>;
  function Probe() { snapshot = catalog.useFigureCatalog(); return <Text>{snapshot.find(f => f.id === future.id)?.name}</Text>; }
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => { tree = Renderer.create(<Probe />); await catalog.refreshFigureCatalog(true); });
  expect(snapshot.at(-1)?.name).toBe('Future fighter');
  expect(catalog.figurePortrait(future.id, snapshot)).toEqual({ uri: future.imageUrl });
  expect(jest.mocked(Keychain.setGenericPassword).mock.calls.some(([, value]) => JSON.parse(value).figures?.some((f: FigureDefinition) => f.variant === 42))).toBe(true);
  const original = snapshot;
  await Renderer.act(async () => { await catalog.refreshFigureCatalog(true); });
  expect(snapshot).toBe(original);
  getCatalog.mockResolvedValue({ schema: 1, figures: [...definitions, { ...future, variant: 43 }] });
  await expect(catalog.refreshFigureCatalog(true)).rejects.toThrow('identities changed');
  expect(snapshot).toBe(original);
  await Renderer.act(() => tree.unmount());
});

test('concurrent model downloads are deduplicated and failed requests can retry', async () => {
  let resolve!: (path: string) => void;
  const native = { getAnimation: jest.fn(() => new Promise<string>(done => { resolve = done; })) };
  NativeModules.RipsyFigureCache = native;
  const first = cacheFigureAnimation(future.animation), second = cacheFigureAnimation(future.animation);
  expect(first).toBe(second); expect(native.getAnimation).toHaveBeenCalledTimes(1);
  resolve('file:///cached.riv'); await expect(first).resolves.toBe('file:///cached.riv');
  native.getAnimation.mockRejectedValueOnce(new Error('Offline'));
  await expect(cacheFigureAnimation(future.animation)).rejects.toThrow('Offline');
  native.getAnimation.mockResolvedValueOnce('file:///cached.riv');
  await expect(cacheFigureAnimation(future.animation)).resolves.toBe('file:///cached.riv');
  delete NativeModules.RipsyFigureCache;
});

test('board loads one remote file for an unknown variant and keeps every stationary controller across turn updates', async () => {
  jest.spyOn(catalog, 'useFigureCatalog').mockReturnValue([...definitions, future]);
  NativeModules.RipsyFigureCache = { getAnimation: jest.fn().mockResolvedValue('file:///future.riv') };
  const state: GameState = { gameId: 'abcdef12', phase: Phase.Active, p0: 'alice', p1: 'bob', isP1Turn: false,
    owners: [Owner.P0, Owner.P1, ...Array(47).fill(Owner.None)], pieces: [Piece.Rock, Piece.Empty, ...Array(47).fill(Piece.Empty)],
    figureVariants: [42, 42, ...Array(47).fill(0)], live0: 1, live1: 1, attacker: 0, defender: 0, outcome: 0, playerChoice: 0,
    tiePending: false, tieFrom: { x: 0, y: 0 }, tieTo: { x: 0, y: 0 }, winner: null };
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => { tree = Renderer.create(<GameBoard state={state} ownOwner={Owner.P0} isPlayer1={false} />); });
  const pieces = tree.root.findAllByType(RiveGamePiece);
  expect(pieces).toHaveLength(2);
  expect(pieces[0].props.file).toBe(pieces[1].props.file);
  expect(pieces.map(p => p.props.isMine)).toEqual([true, false]);
  await Renderer.act(() => tree.update(<GameBoard state={{ ...state, isP1Turn: true }} ownOwner={Owner.P0} isPlayer1={false} />));
  expect(tree.root.findAllByType(RiveGamePiece)).toEqual(pieces);
  expect(NativeModules.RipsyFigureCache.getAnimation).toHaveBeenCalledTimes(1);
  await Renderer.act(() => tree.unmount());
  delete NativeModules.RipsyFigureCache;
});
