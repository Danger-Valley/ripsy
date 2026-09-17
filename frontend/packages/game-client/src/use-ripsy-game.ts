import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Choice, HEIGHT, Owner, Piece, WIDTH, toIdx, toXY, type GameState } from '@rps/core';
import { usePlayerIdentity } from './player-identity';
import { RipsySocketClient, type ConnectionStatus } from './ripsy-socket-client';

const endpoint = () => process.env.NEXT_PUBLIC_GAME_WS_URL ?? 'ws://localhost:8080';

export function useRipsyGame(gameId?: string) {
  const { playerId, sessionToken } = usePlayerIdentity();
  const clientRef = useRef<RipsySocketClient | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [activeGames, setActiveGames] = useState<GameState[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState(0);

  const updateState = useCallback((state: GameState) => {
    stateRef.current = state;
    setGameState(state);
    setError(null);
  }, []);

  useEffect(() => {
    if (!playerId || !sessionToken) return;
    const client = new RipsySocketClient({ endpoint: endpoint(), playerId, sessionToken });
    clientRef.current = client;
    const unsubscribeState = client.onState(updateState);
    const unsubscribeStatus = client.onStatus(nextStatus => {
      setStatus(nextStatus);
      if (nextStatus === 'connected') setError(null);
    });
    const unsubscribeError = client.onError(cause => setError(cause.message));
    const syncVisibility = () => {
      if (document.visibilityState === 'hidden') client.suspend();
      else client.connect(gameId);
    };
    document.addEventListener('visibilitychange', syncVisibility);
    syncVisibility();
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
      unsubscribeState();
      unsubscribeStatus();
      unsubscribeError();
      client.disconnect();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [gameId, playerId, sessionToken, updateState]);

  const run = useCallback(async <Result,>(operation: (client: RipsySocketClient) => Promise<Result>) => {
    const client = clientRef.current;
    if (!client) throw new Error('Game client is not ready');
    setPendingRequests(value => value + 1);
    setError(null);
    try {
      return await operation(client);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The request failed';
      setError(message);
      throw cause;
    } finally {
      setPendingRequests(value => Math.max(0, value - 1));
    }
  }, []);

  const listGames = useCallback(() => run(async client => {
    const result = await client.request({ type: 'listGames' });
    const games = result.games ?? [];
    setActiveGames(games);
    return games;
  }), [run]);

  const createGame = useCallback(async () => {
    const result = await run(client => client.request({ type: 'createGame' }));
    if (!result.gameId) throw new Error('The server did not return a game ID');
    return { gameId: result.gameId };
  }, [run]);

  const refreshFreshGameState = useCallback(async () => {
    if (!gameId) return null;
    const result = await run(client => client.request({ type: 'getGame', gameId }));
    return result.state ?? null;
  }, [gameId, run]);
  const refreshGameState = useCallback(async () => { await refreshFreshGameState(); }, [refreshFreshGameState]);
  const joinGame = useCallback(async (id = gameId) => {
    if (!id) throw new Error('Missing game ID');
    await run(client => client.request({ type: 'joinGame', gameId: id }));
  }, [gameId, run]);
  const submitCustomLineup = useCallback(async (xs: number[], ys: number[], pieces: number[], figureVariants?: number[]) => {
    if (!gameId) throw new Error('Missing game ID');
    await run(client => client.request({ type: 'submitLineup', gameId, xs, ys, pieces, figureVariants }));
  }, [gameId, run]);
  const movePiece = useCallback(async (fromX: number, fromY: number, toX: number, toY: number) => {
    if (!gameId) throw new Error('Missing game ID');
    await run(client => client.request({ type: 'movePiece', gameId, fromX, fromY, toX, toY }));
  }, [gameId, run]);
  const chooseWeapon = useCallback(async (choice: Choice) => {
    if (!gameId) throw new Error('Missing game ID');
    await run(client => client.request({ type: 'chooseWeapon', gameId, choice }));
  }, [gameId, run]);

  const isPlayer0 = Boolean(gameState && playerId && gameState.p0 === playerId);
  const isPlayer1 = Boolean(gameState && playerId && gameState.p1 === playerId);
  const ownOwner = isPlayer0 ? Owner.P0 : isPlayer1 ? Owner.P1 : Owner.None;
  const isMyTurn = Boolean(gameState && ((isPlayer0 && !gameState.isP1Turn) || (isPlayer1 && gameState.isP1Turn)));
  const isPlayerChoice = useCallback(() => Boolean(stateRef.current && stateRef.current.playerChoice !== Choice.None), []);

  return useMemo(() => ({
    gameState, activeGames, status, error,
    loading: pendingRequests > 0,
    isBusy: pendingRequests > 0,
    isInitialized: status === 'connected',
    isConnected: status === 'connected',
    createGame, listGames, joinGame, submitCustomLineup, submitLineup: submitCustomLineup,
    movePiece, chooseWeapon, refreshGameState, refreshFreshGameState, refresh: refreshFreshGameState,
    isPlayer0, isPlayer1, ownOwner, isMyTurn, isPlayerChoice,
    getAvailableMoves: (fromX: number, fromY: number) => [
      { x: fromX + 1, y: fromY }, { x: fromX - 1, y: fromY },
      { x: fromX, y: fromY + 1 }, { x: fromX, y: fromY - 1 },
    ].filter(({ x, y }) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT),
    isValidMove: (fromX: number, fromY: number, toX: number, toY: number) => Math.abs(fromX - toX) + Math.abs(fromY - toY) === 1,
  }), [activeGames, chooseWeapon, createGame, error, gameState, isMyTurn, isPlayer0, isPlayer1, joinGame, listGames, movePiece, ownOwner, pendingRequests, refreshFreshGameState, refreshGameState, status, submitCustomLineup, isPlayerChoice]);
}

export { Choice, HEIGHT, Owner, Piece, WIDTH, toIdx, toXY } from '@rps/core';
export type { GameState } from '@rps/core';
