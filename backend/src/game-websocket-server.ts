import type { Server as HttpServer } from 'node:http';
import {
  PROTOCOL_VERSION,
  ProtocolMessageError,
  ProtocolVersionError,
  parseClientMessage,
  type Choice,
  type ClientAction,
  type GameState,
  type ServerMessage,
} from '@rps/core';
import { WebSocket, WebSocketServer } from 'ws';
import type { BackendDiagnosticEvent } from './diagnostics.js';
import { pushTargetsForAction, type PushTarget } from './push-notifications.js';
import type { SessionManager } from './session.js';

export interface GameStore {
  create(playerId: string): Promise<GameState>;
  list(playerId: string): Promise<GameState[]>;
  get(gameId: string, playerId: string): Promise<GameState>;
  join(gameId: string, playerId: string): Promise<GameState>;
  submitLineup(gameId: string, playerId: string, xs: number[], ys: number[], pieces: number[], figureVariants?: number[], figureAssetIds?: Array<string | null>): Promise<GameState>;
  move(gameId: string, playerId: string, fromX: number, fromY: number, toX: number, toY: number): Promise<GameState>;
  choose(gameId: string, playerId: string, choice: Choice): Promise<GameState>;
  views(gameId: string): Promise<Array<{ playerId: string; state: GameState }>>;
}

interface GameWebSocketServerOptions {
  server: HttpServer;
  store: GameStore;
  sessionManager: SessionManager;
  diagnose: (event: BackendDiagnosticEvent) => void;
  sendPush?: (targets: PushTarget[]) => Promise<void>;
  heartbeatIntervalMs?: number;
  authenticationTimeoutMs?: number;
}

export function attachGameWebSocketServer({
  server,
  store,
  sessionManager,
  diagnose,
  sendPush,
  heartbeatIntervalMs = 30_000,
  authenticationTimeoutMs = 10_000,
}: GameWebSocketServerOptions) {
  const sockets = new WebSocketServer({ server, maxPayload: 16 * 1024 });
  const responsiveSockets = new WeakSet<WebSocket>();
  const clients = new Map<string, Set<WebSocket>>();
  const heartbeatInterval = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!responsiveSockets.has(socket)) {
        socket.terminate();
        continue;
      }
      responsiveSockets.delete(socket);
      socket.ping();
    }
  }, heartbeatIntervalMs);
  heartbeatInterval.unref();

  sockets.on('connection', (socket) => {
    diagnose({ level: 'info', event: 'socket.connected', openSockets: sockets.clients.size });
    responsiveSockets.add(socket);
    socket.on('pong', () => responsiveSockets.add(socket));
    let playerId: string | null = null;
    const authenticationTimeout = setTimeout(() => socket.close(1008, 'Authentication timed out'), authenticationTimeoutMs);

    socket.on('message', (data) => {
      try {
        const message = parseClientMessage(JSON.parse(data.toString()) as unknown);
        if (message.type === 'authenticate') {
          if (playerId) throw new Error('Socket is already authenticated');
          playerId = sessionManager.verify(message.token).playerId;
          const playerSockets = clients.get(playerId) ?? new Set<WebSocket>();
          playerSockets.add(socket);
          clients.set(playerId, playerSockets);
          clearTimeout(authenticationTimeout);
          send(socket, { type: 'connected', playerId, protocolVersion: PROTOCOL_VERSION });
          diagnose({ level: 'info', event: 'socket.authenticated', openSockets: sockets.clients.size });
          return;
        }
        if (!playerId) throw new Error('Authenticate before sending game commands');
        void handle(socket, playerId, message);
      } catch (error) {
        if (error instanceof ProtocolVersionError) {
          diagnose({ level: 'warn', event: 'socket.rejected', code: 'protocol_version' });
          send(socket, {
            type: 'error',
            code: 'UNSUPPORTED_PROTOCOL_VERSION',
            message: error.message,
            expectedProtocolVersion: error.expectedVersion,
            receivedProtocolVersion: error.receivedVersion,
          });
          socket.close(1002, 'Unsupported protocol version');
          return;
        }
        const isInvalidMessage = error instanceof ProtocolMessageError || error instanceof SyntaxError;
        diagnose({ level: 'warn', event: 'socket.rejected', code: isInvalidMessage ? 'invalid_message' : 'authentication' });
        send(socket, {
          type: 'error',
          code: isInvalidMessage ? 'INVALID_MESSAGE' : 'AUTHENTICATION_FAILED',
          message: error instanceof Error ? error.message : 'Invalid request',
        });
        if (!playerId) socket.close(1008, 'Authentication failed');
      }
    });

    socket.on('close', (code) => {
      clearTimeout(authenticationTimeout);
      diagnose({ level: 'info', event: 'socket.closed', code, authenticated: Boolean(playerId), openSockets: sockets.clients.size });
      if (!playerId) return;
      const playerSockets = clients.get(playerId);
      if (!playerSockets) return;
      playerSockets.delete(socket);
      if (playerSockets.size === 0) clients.delete(playerId);
    });
  });

  async function handle(socket: WebSocket, playerId: string, action: ClientAction) {
    const startedAt = Date.now();
    try {
      if (action.type === 'listGames') {
        const games = await store.list(playerId);
        send(socket, { type: 'result', requestId: action.requestId, games });
        diagnose({ level: 'info', event: 'command.completed', action: action.type, durationMs: Date.now() - startedAt, outcome: 'success' });
        return;
      }
      let gameId: string;
      let state: GameState;
      switch (action.type) {
        case 'createGame':
          state = await store.create(playerId);
          gameId = state.gameId;
          break;
        case 'getGame':
          gameId = action.gameId;
          state = await store.get(gameId, playerId);
          break;
        case 'joinGame':
          gameId = action.gameId;
          state = await store.join(gameId, playerId);
          break;
        case 'submitLineup':
          gameId = action.gameId;
          state = await store.submitLineup(gameId, playerId, action.xs, action.ys, action.pieces, action.figureVariants, action.figureAssetIds);
          break;
        case 'movePiece':
          gameId = action.gameId;
          state = await store.move(gameId, playerId, action.fromX, action.fromY, action.toX, action.toY);
          break;
        case 'chooseWeapon':
          gameId = action.gameId;
          state = await store.choose(gameId, playerId, action.choice);
          break;
      }
      send(socket, { type: 'result', requestId: action.requestId, gameId, state });
      diagnose({ level: 'info', event: 'command.completed', action: action.type, durationMs: Date.now() - startedAt, outcome: 'success' });
      const pushTargets = pushTargetsForAction(action.type, state, playerId);
      if (sendPush && pushTargets.length > 0) {
        void sendPush(pushTargets)
          .then(() => diagnose({ level: 'info', event: 'push.completed', recipients: pushTargets.length }))
          .catch(() => diagnose({ level: 'error', event: 'push.failed', recipients: pushTargets.length }));
      }
    } catch (error) {
      diagnose({ level: 'info', event: 'command.completed', action: action.type, durationMs: Date.now() - startedAt, outcome: 'failure' });
      send(socket, {
        type: 'error',
        code: 'REQUEST_FAILED',
        requestId: action.requestId,
        message: error instanceof Error ? error.message : 'Request failed',
      });
    }
  }

  async function broadcast(gameId: string) {
    const startedAt = Date.now();
    try {
      let recipients = 0;
      for (const { playerId, state } of await store.views(gameId)) {
        for (const socket of clients.get(playerId) ?? []) {
          send(socket, { type: 'state', gameId, state });
          recipients += 1;
        }
      }
      diagnose({ level: 'info', event: 'broadcast.completed', durationMs: Date.now() - startedAt, recipients });
    } catch {
      diagnose({ level: 'error', event: 'broadcast.failed', durationMs: Date.now() - startedAt });
    }
  }

  function close() {
    clearInterval(heartbeatInterval);
    for (const playerSockets of clients.values()) {
      for (const socket of playerSockets) socket.close(1001, 'Server shutting down');
    }
    sockets.close();
  }

  return { broadcast, close };
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
