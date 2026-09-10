import { RipsySocketClient } from '@rps/game-client/socket';

class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

test('connects with the player identity and resolves matching requests', async () => {
  const socket = new FakeSocket();
  let openedUrl = '';
  const client = new RipsySocketClient({
    endpoint: 'ws://localhost:8080',
    playerId: 'player one',
    createRequestId: () => 'request-1',
    socketFactory: url => {
      openedUrl = url;
      return socket as unknown as WebSocket;
    },
  });

  client.connect();
  socket.open();
  expect(openedUrl).toBe('ws://localhost:8080?playerId=player%20one');

  const response = client.request({ type: 'createGame' });
  expect(JSON.parse(socket.sent[0] ?? '{}')).toEqual({ type: 'createGame', requestId: 'request-1' });
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
    requestTimeoutMs: 100,
    socketFactory: () => socket as unknown as WebSocket,
  });
  client.connect();
  socket.open();

  const response = client.request({ type: 'createGame' });
  jest.advanceTimersByTime(101);
  await expect(response).rejects.toThrow('did not respond in time');

  client.disconnect();
  jest.useRealTimers();
});
