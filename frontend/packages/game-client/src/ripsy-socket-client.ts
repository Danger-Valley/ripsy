import {
  PROTOCOL_VERSION,
  ProtocolVersionError,
  parseServerMessage,
  type ClientAction,
  type GameState,
  type ServerMessage,
} from '@rps/core';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'suspended' | 'closed';

type ResultMessage = Extract<ServerMessage, { type: 'result' }>;
type ClientActionInput = ClientAction extends infer Action
  ? Action extends { requestId: string }
    ? Omit<Action, 'requestId'>
    : never
  : never;

type PendingRequest = {
  resolve: (message: ResultMessage) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export interface RipsySocketClientOptions {
  endpoint: string;
  playerId: string;
  sessionToken: string;
  requestTimeoutMs?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  socketFactory?: (url: string) => WebSocket;
  createRequestId?: () => string;
}

export class RipsySocketClient {
  private socket: WebSocket | null = null;
  private currentGameId: string | undefined;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private shouldReconnect = false;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly stateListeners = new Set<(state: GameState) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private status: ConnectionStatus = 'idle';

  constructor(private readonly options: RipsySocketClientOptions) {}

  connect(gameId?: string) {
    this.currentGameId = gameId;
    this.shouldReconnect = true;
    if (this.socket?.readyState === 1 || this.socket?.readyState === 0) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.openSocket();
  }

  setGameId(gameId?: string) {
    this.currentGameId = gameId;
    if (gameId && this.status === 'connected') {
      void this.request({ type: 'getGame', gameId }).catch((error: unknown) => this.emitError(toError(error)));
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.rejectPending(new Error('Connection closed'));
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'Client closed');
    this.setStatus('closed');
  }

  suspend() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.rejectPending(new Error('Connection suspended while the app is in the background'));
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'App backgrounded');
    this.setStatus('suspended');
  }

  async request(action: ClientActionInput): Promise<ResultMessage> {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1 || this.status !== 'connected') throw new Error('Game server is not connected');

    const requestId = (this.options.createRequestId ?? createRequestId)();
    const envelope = { ...action, requestId } as ClientAction;
    return new Promise<ResultMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('The game server did not respond in time'));
      }, this.options.requestTimeoutMs ?? 12_000);
      this.pending.set(requestId, { resolve, reject, timeout });
      socket.send(JSON.stringify(envelope));
    });
  }

  onState(listener: (state: GameState) => void) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onError(listener: (error: Error) => void) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onStatus(listener: (status: ConnectionStatus) => void) {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private openSocket() {
    if (!this.shouldReconnect || this.socket?.readyState === 1 || this.socket?.readyState === 0) return;
    this.setStatus(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    const socket = (this.options.socketFactory ?? ((target) => new WebSocket(target)))(this.options.endpoint);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      socket.send(JSON.stringify({
        type: 'authenticate',
        token: this.options.sessionToken,
        protocolVersion: PROTOCOL_VERSION,
      }));
    };
    socket.onmessage = (event) => this.handleMessage(socket, String(event.data));
    socket.onerror = () => {
      if (this.socket === socket) this.emitError(new Error('Cannot connect to the game server'));
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.rejectPending(new Error('Connection interrupted'));
      if (event.code === 1002 || event.code === 1008) {
        this.shouldReconnect = false;
        this.emitError(new Error(event.reason || 'Game session authentication failed'));
      }
      if (this.shouldReconnect) this.scheduleReconnect();
      else this.setStatus('closed');
    };
  }

  private handleMessage(socket: WebSocket, payload: string) {
    if (this.socket !== socket) return;
    let message: ServerMessage;
    try {
      message = parseServerMessage(JSON.parse(payload) as unknown);
    } catch (error) {
      this.emitError(error instanceof ProtocolVersionError
        ? error
        : new Error('The game server sent an invalid message'));
      return;
    }

    if (message.type === 'state') {
      if (!this.currentGameId || message.gameId === this.currentGameId) this.emitState(message.state);
      return;
    }
    if (message.type === 'connected') {
      if (message.playerId !== this.options.playerId) {
        this.emitError(new Error('The game server authenticated a different player'));
        this.disconnect();
        return;
      }
      this.reconnectAttempt = 0;
      this.setStatus('connected');
      if (this.currentGameId) {
        this.request({ type: 'getGame', gameId: this.currentGameId }).catch((error: unknown) => this.emitError(toError(error)));
      }
      return;
    }
    if (message.type === 'result') {
      if (message.state) this.emitState(message.state);
      const pending = this.pending.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(message.requestId);
        pending.resolve(message);
      }
      return;
    }
    if (message.type === 'error') {
      const error = message.code === 'UNSUPPORTED_PROTOCOL_VERSION'
        ? new ProtocolVersionError(message.expectedProtocolVersion ?? PROTOCOL_VERSION, message.receivedProtocolVersion)
        : new Error(message.message);
      if (message.requestId) {
        const pending = this.pending.get(message.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pending.delete(message.requestId);
          pending.reject(error);
        }
      }
      this.emitError(error);
    }
  }

  private scheduleReconnect() {
    this.reconnectAttempt += 1;
    this.setStatus('reconnecting');
    const base = this.options.reconnectBaseDelayMs ?? 750;
    const maximum = this.options.reconnectMaxDelayMs ?? 10_000;
    const delay = Math.min(maximum, base * 2 ** Math.min(this.reconnectAttempt - 1, 5));
    const jitteredDelay = Math.round(delay * (0.8 + Math.random() * 0.4));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.openSocket();
    }, jitteredDelay);
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private emitState(state: GameState) {
    for (const listener of this.stateListeners) listener(state);
  }

  private emitError(error: Error) {
    for (const listener of this.errorListeners) listener(error);
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

function createRequestId() {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoApi?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function toError(value: unknown) {
  return value instanceof Error ? value : new Error('Unexpected game client error');
}
