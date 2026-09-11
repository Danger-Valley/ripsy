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
  assert.throws(
    () => parseServerMessage({ type: 'state', gameId: 'game-1', state: { ...state, owners: [] } }),
    ProtocolMessageError,
  );
  const list = parseServerMessage({ type: 'result', requestId: 'request-list', games: [state] });
  assert.equal(list.type === 'result' ? list.games?.[0]?.gameId : undefined, 'game-1');
  assert.throws(
    () => parseServerMessage({ type: 'result', requestId: 'request-list', games: [{ ...state, pieces: [] }] }),
    ProtocolMessageError,
  );
});
