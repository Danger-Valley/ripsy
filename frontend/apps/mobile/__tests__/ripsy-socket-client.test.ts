import { RipsySocketClient } from '@rps/game-client/socket';

class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  sent: string[] = [];

  send(payload: string) {
    this.sent.push(payload);
  }

  close(code = 1000, reason = 'Client closed') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  interrupt() {
    this.close(1006, 'Network interrupted');
  }
}

test('connects with the player identity and resolves matching requests', async () => {
  const socket = new FakeSocket();
  let openedUrl = '';
  const client = new RipsySocketClient({
    endpoint: 'ws://localhost:8080',
    playerId: 'player one',
    sessionToken: 'signed-token',
    createRequestId: () => 'request-1',
    socketFactory: url => {
      openedUrl = url;
      return socket as unknown as WebSocket;
    },
  });

  client.connect();
  socket.open();
  expect(openedUrl).toBe('ws://localhost:8080');
  expect(JSON.parse(socket.sent[0] ?? '{}')).toEqual({ type: 'authenticate', token: 'signed-token' });
  socket.receive({ type: 'connected', playerId: 'player one' });

  const response = client.request({ type: 'createGame' });
  expect(JSON.parse(socket.sent[1] ?? '{}')).toEqual({ type: 'createGame', requestId: 'request-1' });
  socket.receive({ type: 'result', requestId: 'request-1', gameId: 'game-123' });

  await expect(response).resolves.toMatchObject({ gameId: 'game-123' });
  client.disconnect();
});

test('rejects a request when the server does not respond', async () => {
  jest.useFakeTimers();
  const socket = new FakeSocket();
  const client = new RipsySocketClient({
    endpoint: 'ws://localhost:8080',
    playerId: 'player-1',
    sessionToken: 'signed-token',
    requestTimeoutMs: 100,
    socketFactory: () => socket as unknown as WebSocket,
  });
  client.connect();
  socket.open();
  socket.receive({ type: 'connected', playerId: 'player-1' });

  const response = client.request({ type: 'createGame' });
  jest.advanceTimersByTime(101);
  await expect(response).rejects.toThrow('did not respond in time');

  client.disconnect();
  jest.useRealTimers();
});

test('reauthenticates and reloads the authoritative game state after reconnecting', () => {
  jest.useFakeTimers();
  const sockets: FakeSocket[] = [];
  let requestNumber = 0;
  const states: string[] = [];
  const client = new RipsySocketClient({
    endpoint: 'ws://localhost:8080',
    playerId: 'player-1',
    sessionToken: 'signed-token',
    createRequestId: () => `request-${++requestNumber}`,
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  });
  client.onState(state => states.push(state.gamePda));

  client.connect('game-123');
  sockets[0]!.open();
  sockets[0]!.receive({ type: 'connected', playerId: 'player-1' });
  expect(JSON.parse(sockets[0]!.sent[1] ?? '{}')).toEqual({ type: 'getGame', gameId: 'game-123', requestId: 'request-1' });

  sockets[0]!.interrupt();
  jest.advanceTimersByTime(1_000);
  expect(sockets).toHaveLength(2);
  sockets[1]!.open();
  expect(JSON.parse(sockets[1]!.sent[0] ?? '{}')).toEqual({ type: 'authenticate', token: 'signed-token' });
  sockets[1]!.receive({ type: 'connected', playerId: 'player-1' });
  expect(JSON.parse(sockets[1]!.sent[1] ?? '{}')).toEqual({ type: 'getGame', gameId: 'game-123', requestId: 'request-2' });

  sockets[0]!.receive({ type: 'state', gameId: 'game-123', state: { gamePda: 'stale-game' } });
  sockets[1]!.receive({ type: 'state', gameId: 'game-123', state: { gamePda: 'game-123' } });
  expect(states).toEqual(['game-123']);

  client.disconnect();
  jest.useRealTimers();
});

test('suspends without scheduling a reconnect and resumes explicitly', () => {
  const sockets: FakeSocket[] = [];
  const statuses: string[] = [];
  const client = new RipsySocketClient({
    endpoint: 'ws://localhost:8080',
    playerId: 'player-1',
    sessionToken: 'signed-token',
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  });
  client.onStatus(status => statuses.push(status));

  client.connect();
  client.suspend();
  expect(statuses.at(-1)).toBe('suspended');
  expect(sockets).toHaveLength(1);

  client.connect();
  expect(sockets).toHaveLength(2);
  expect(statuses.at(-1)).toBe('connecting');
  client.disconnect();
});
