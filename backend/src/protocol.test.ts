import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROTOCOL_VERSION,
  ProtocolMessageError,
  ProtocolVersionError,
  parseClientMessage,
  parseServerMessage,
} from '@rps/core';
import { createGameRecord, gameView } from './game-engine.js';

test('validates client actions instead of trusting parsed JSON', () => {
  assert.deepEqual(parseClientMessage({
    type: 'listGames',
    requestId: 'request-list',
  }), {
    type: 'listGames',
    requestId: 'request-list',
  });
  assert.deepEqual(parseClientMessage({
    type: 'movePiece',
    requestId: 'request-1',
    gameId: 'game-1',
    fromX: 0,
    fromY: 1,
    toX: 0,
    toY: 2,
  }), {
    type: 'movePiece',
    requestId: 'request-1',
    gameId: 'game-1',
    fromX: 0,
    fromY: 1,
    toX: 0,
    toY: 2,
  });
  assert.throws(
    () => parseClientMessage({ type: 'movePiece', requestId: 'request-1', gameId: 'game-1', fromX: '0' }),
    ProtocolMessageError,
  );
  const variants = [...Array(7).fill(1), ...Array(7).fill(2)];
  const assetIds = [...Array(7).fill(null), ...Array(7).fill('Vote111111111111111111111111111111111111111')];
  const lineup = parseClientMessage({
    type: 'submitLineup',
    requestId: 'request-lineup',
    gameId: 'game-1',
    xs: Array(14).fill(0),
    ys: Array(14).fill(0),
    pieces: Array(14).fill(1),
    figureVariants: variants,
    figureAssetIds: assetIds,
  });
  assert.deepEqual(lineup.type === 'submitLineup' ? lineup.figureVariants : undefined, variants);
  assert.deepEqual(lineup.type === 'submitLineup' ? lineup.figureAssetIds : undefined, assetIds);
  assert.throws(
    () => parseClientMessage({
      type: 'submitLineup', requestId: 'invalid-assets', gameId: 'game-1',
      xs: Array(14).fill(0), ys: Array(14).fill(0), pieces: Array(14).fill(1),
      figureAssetIds: [...Array(13).fill(null), 'not-a-solana-address'],
    }),
    ProtocolMessageError,
  );
});

test('rejects unsupported client protocol versions with a typed error', () => {
  assert.throws(
    () => parseClientMessage({ type: 'authenticate', token: 'token', protocolVersion: 99 }),
    (error: unknown) => error instanceof ProtocolVersionError &&
      error.expectedVersion === PROTOCOL_VERSION &&
      error.receivedVersion === 99,
  );
});

test('treats an unversioned legacy handshake as protocol version 1 during rollout', () => {
  assert.deepEqual(
    parseClientMessage({ type: 'authenticate', token: 'legacy-token' }),
    { type: 'authenticate', token: 'legacy-token', protocolVersion: PROTOCOL_VERSION },
  );
  assert.deepEqual(
    parseServerMessage({ type: 'connected', playerId: 'legacy-player' }),
    { type: 'connected', playerId: 'legacy-player', protocolVersion: PROTOCOL_VERSION },
  );
});

test('validates complete server game state payloads', () => {
  const state = gameView(createGameRecord('game-1', 'alice'), 'alice');
  const message = parseServerMessage({ type: 'state', gameId: 'game-1', state });
  assert.equal(message.type, 'state');
  assert.equal(message.state.gameId, 'game-1');
  assert.equal(message.state.tieRound, 0);
  assert.equal(message.state.lineupDeadlineAt, state.lineupDeadlineAt);
  assert.throws(
    () => parseServerMessage({ type: 'state', gameId: 'game-1', state: { ...state, owners: [] } }),
    ProtocolMessageError,
  );
  assert.throws(
    () => parseServerMessage({ type: 'state', gameId: 'game-1', state: { ...state, tieRound: -1 } }),
    ProtocolMessageError,
  );
  assert.throws(
    () => parseServerMessage({ type: 'state', gameId: 'game-1', state: { ...state, figureVariants: [] } }),
    ProtocolMessageError,
  );
  const list = parseServerMessage({ type: 'result', requestId: 'request-list', games: [state] });
  assert.equal(list.type === 'result' ? list.games?.[0]?.gameId : undefined, 'game-1');
  assert.throws(
    () => parseServerMessage({ type: 'result', requestId: 'request-list', games: [{ ...state, pieces: [] }] }),
    ProtocolMessageError,
  );
});
