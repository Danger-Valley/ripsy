import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Choice, Owner, Piece, toIdx, toXY, WIDTH, HEIGHT } from '@rps/core';
import type { ClientAction, GameState, ServerMessage } from '@rps/core';
import { usePlayerIdentity } from './player-identity';

type PendingRequest = {
  resolve: (message: Extract<ServerMessage, { type: 'result' }>) => void;
  reject: (error: Error) => void;
};

type ClientActionInput = ClientAction extends infer Action
  ? Action extends { requestId: string }
    ? Omit<Action, 'requestId'>
    : never
  : never;

const endpoint = () => process.env.NEXT_PUBLIC_GAME_WS_URL ?? 'ws://localhost:8080';

export function useRipsyGame(gameId?: string) {
  const { playerId } = usePlayerIdentity();
  const socketRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const stateRef = useRef<GameState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(Boolean(gameId));
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const updateState = useCallback((state: GameState) => {
    stateRef.current = state;
    setGameState(state);
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!playerId) return;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (disposed) return;
      const socket = new WebSocket(`${endpoint()}?playerId=${encodeURIComponent(playerId)}`);
      socketRef.current = socket;
      socket.onopen = () => {
        setIsInitialized(true);
        setError(null);
        if (gameId) send({ type: 'getGame', requestId: crypto.randomUUID(), gameId }).catch(() => undefined);
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data as string) as ServerMessage;
        if (message.type === 'state' && (!gameId || message.gameId === gameId)) updateState(message.state);
        if (message.type === 'result') {
          if (message.state) updateState(message.state);
          const pending = pendingRef.current.get(message.requestId);
          pending?.resolve(message);
          pendingRef.current.delete(message.requestId);
        }
        if (message.type === 'error') {
          setLoading(false);
          setError(message.message);
          if (message.requestId) {
            pendingRef.current.get(message.requestId)?.reject(new Error(message.message));
            pendingRef.current.delete(message.requestId);
          }
        }
      };
      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        setIsInitialized(false);
        if (!disposed) reconnectTimer = setTimeout(connect, 1500);
      };
      socket.onerror = () => setError('Cannot connect to the game server');
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
      for (const pending of pendingRef.current.values()) pending.reject(new Error('Connection closed'));
      pendingRef.current.clear();
    };
  }, [gameId, playerId, updateState]);

  const send = useCallback(async (action: ClientAction) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Game server is not connected');
    setLoading(true);
    setError(null);
    return new Promise<Extract<ServerMessage, { type: 'result' }>>((resolve, reject) => {
      pendingRef.current.set(action.requestId, { resolve, reject });
      socket.send(JSON.stringify(action));
    }).finally(() => setLoading(false));
  }, []);

  const request = useCallback(async (action: ClientActionInput) => {
    return send({ ...action, requestId: crypto.randomUUID() } as ClientAction);
  }, [send]);

  const createGame = useCallback(async () => {
    const result = await request({ type: 'createGame' });
    if (!result.gameId) throw new Error('The server did not return a game ID');
    return { gamePda: result.gameId };
  }, [request]);

  const refreshFreshGameState = useCallback(async () => {
    if (!gameId) return null;
    const result = await request({ type: 'getGame', gameId });
    return result.state ?? null;
  }, [gameId, request]);

  const refreshGameState = useCallback(async () => { await refreshFreshGameState(); }, [refreshFreshGameState]);
  const joinGame = useCallback(async (id: string) => { await request({ type: 'joinGame', gameId: id }); }, [request]);
  const submitCustomLineup = useCallback(async (xs: number[], ys: number[], pieces: number[]) => {
    if (!gameId) throw new Error('Missing game ID');
    await request({ type: 'submitLineup', gameId, xs, ys, pieces });
  }, [gameId, request]);
  const movePiece = useCallback(async (fromX: number, fromY: number, toX: number, toY: number) => {
    if (!gameId) throw new Error('Missing game ID');
    await request({ type: 'movePiece', gameId, fromX, fromY, toX, toY });
  }, [gameId, request]);
  const chooseWeapon = useCallback(async (choice: Choice) => {
    if (!gameId) throw new Error('Missing game ID');
    await request({ type: 'chooseWeapon', gameId, choice });
  }, [gameId, request]);

  const isPlayer0 = Boolean(gameState && playerId && gameState.p0 === playerId);
  const isPlayer1 = Boolean(gameState && playerId && gameState.p1 === playerId);
  const isMyTurn = Boolean(gameState && ((isPlayer0 && !gameState.isP1Turn) || (isPlayer1 && gameState.isP1Turn)));
  const isPlayerChoice = useCallback(() => Boolean(stateRef.current && stateRef.current.playerChoice !== Choice.None), []);

  return useMemo(() => ({
    gameState,
    loading,
    error,
    createGame,
    joinGame,
    submitCustomLineup,
    movePiece,
    chooseWeapon,
    refreshGameState,
    refreshFreshGameState,
    isPlayer0,
    isPlayer1,
    isMyTurn,
    isPlayerChoice,
    isInitialized,
    getAvailableMoves: (fromX: number, fromY: number) => [
      { x: fromX + 1, y: fromY }, { x: fromX - 1, y: fromY },
      { x: fromX, y: fromY + 1 }, { x: fromX, y: fromY - 1 },
    ].filter(({ x, y }) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT),
    isValidMove: (fromX: number, fromY: number, toX: number, toY: number) => Math.abs(fromX - toX) + Math.abs(fromY - toY) === 1,
  }), [chooseWeapon, createGame, error, gameState, isInitialized, isMyTurn, isPlayer0, isPlayer1, joinGame, loading, movePiece, refreshFreshGameState, refreshGameState, submitCustomLineup, isPlayerChoice]);
}

export { Choice, HEIGHT, Owner, Piece, WIDTH, toIdx, toXY } from '@rps/core';
export type { GameState } from '@rps/core';
