// Explicit, bounded production smoke test. Creates one disposable starter-only
// room with two new anonymous sessions; no wallets, purchases or existing rooms.
// Run: node --import tsx scripts/check-online-state-stream.mjs --live
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { Owner, Phase, Piece, toIdx } from '../frontend/packages/core/src/index.ts';
import { RipsySocketClient } from '../frontend/packages/game-client/src/ripsy-socket-client.ts';

if (process.argv.length !== 3 || process.argv[2] !== '--live') {
  console.error('Pass --live to explicitly create a disposable production test room.');
  process.exit(1);
}

const clients = [];
const sockets = [];
const latest = [];
const broadcasts = [0, 0];
const requestDurations = [];
const idleChecks = [];
let room;
let flooded = false;

function requireHealthy() {
  if (flooded) throw new Error('State stream exceeded its safety limit');
}

async function quiet(label) {
  await delay(600); // Drain the one expected publication after an action.
  requireHealthy();
  const before = [...broadcasts];
  await delay(3_000);
  requireHealthy();
  const extra = broadcasts.map((count, index) => count - before[index]);
  assert.deepEqual(extra, [0, 0], `${label}: idle clients received repeated broadcasts`);
  idleChecks.push({ label, observationMs: 3_000, unsolicitedStates: extra });
}

async function connect(index) {
  const response = await fetch('https://api.ripsy.fun/session', {
    method: 'POST', signal: AbortSignal.timeout(8_000),
  });
  assert.equal(response.status, 201, 'Could not create a test session');
  const session = await response.json();
  const client = new RipsySocketClient({
    endpoint: 'wss://api.ripsy.fun',
    playerId: session.playerId,
    sessionToken: session.token,
    requestTimeoutMs: 8_000,
    diagnosticSink: event => {
      if (event.event === 'request.completed') {
        requestDurations.push({ action: event.action, durationMs: event.durationMs, outcome: event.outcome });
      }
    },
    socketFactory: url => {
      const socket = new WebSocket(url);
      sockets.push(socket);
      socket.on('message', bytes => {
        const message = JSON.parse(bytes.toString());
        if (message.type === 'state' && message.gameId === room) {
          broadcasts[index]++;
          if (broadcasts[index] > 100) {
            flooded = true;
            for (const active of sockets) active.terminate();
          }
        }
      });
      return socket;
    },
  });
  clients.push(client);
  client.onState(state => { if (!room || state.gameId === room) latest[index] = state; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(new Error('Test socket connection timed out')); }, 8_000);
    const unsubscribe = client.onStatus(status => {
      if (status !== 'connected') return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
    client.connect();
  });
  return client;
}

try {
  const first = await connect(0);
  room = (await first.request({ type: 'createGame' })).gameId;
  assert.ok(room, 'No test room returned');
  first.setGameId(room);
  const second = await connect(1);
  await second.request({ type: 'joinGame', gameId: room });
  second.setGameId(room);
  await quiet('joined');

  // Explicit state/list reads must return replies, not create publications.
  const beforeReads = [...broadcasts];
  for (const client of clients) {
    await client.request({ type: 'getGame', gameId: room });
    await client.request({ type: 'listGames' });
  }
  await delay(600);
  assert.deepEqual(broadcasts, beforeReads, 'Read requests caused a broadcast');

  const xs = Array.from({ length: 14 }, (_, index) => index % 7);
  const pieces = [
    ...Array(4).fill(Piece.Rock), ...Array(4).fill(Piece.Paper),
    ...Array(4).fill(Piece.Scissors), Piece.Flag, Piece.Trap,
  ];
  for (const [index, client] of clients.entries()) {
    await client.request({ type: 'submitLineup', gameId: room, xs,
      ys: xs.map((_, slot) => (index === 0 ? 5 : 0) + Math.floor(slot / 7)),
      pieces, figureVariants: Array(14).fill(1), figureAssetIds: Array(14).fill(null),
    });
  }
  await quiet('active');
  assert.equal(latest[0]?.phase, Phase.Active);
  assert.equal(latest[1]?.phase, Phase.Active);
  assert.equal(latest[0].pieces[toIdx(0, 0)], Piece.Empty, 'Opponent weapon was exposed');
  assert.equal(latest[1].pieces[toIdx(0, 5)], Piece.Empty, 'Opponent weapon was exposed');

  for (const [index, fromY, toY] of [[0, 5, 4], [1, 1, 2], [0, 4, 3], [1, 2, 3]]) {
    const beforeMove = [...broadcasts];
    await clients[index].request({ type: 'movePiece', gameId: room, fromX: 0, fromY, toX: 0, toY });
    await delay(600);
    requireHealthy();
    assert.deepEqual(broadcasts.map((count, player) => count - beforeMove[player]), [1, 1],
      'An accepted move must publish exactly once to each player');
    assert.equal(latest[0].isP1Turn, index === 0);
    assert.equal(latest[1].isP1Turn, index === 0);
  }
  assert.equal(latest[0].owners[toIdx(0, 3)], Owner.P1);
  assert.equal(latest[0].defender, Piece.Rock);
  assert.equal(latest[0].attacker, Piece.Paper);
  assert.equal(latest[0].live0, 13);
  await quiet('after-combat');

  first.suspend();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(new Error('Reconnect timed out')); }, 8_000);
    const unsubscribe = first.onState(state => {
      if (state.gameId !== room || state.owners[toIdx(0, 3)] !== Owner.P1) return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
    first.connect(room);
  });
  await quiet('after-reconnect');
  console.log(JSON.stringify({ ok: true, acceptedMoves: 4, combatVerified: true,
    readRequestsDidNotPublish: true, reconnectVerified: true, idleChecks, broadcasts, requestDurations }));
} catch (error) {
  // Do not print provider messages, request/room/player IDs or session tokens.
  console.error(JSON.stringify({ ok: false, flooded,
    failure: error instanceof assert.AssertionError ? error.message : 'Online stream verification failed' }));
  process.exitCode = 1;
} finally {
  for (const client of clients) client.disconnect();
  for (const socket of sockets) socket.terminate();
}
