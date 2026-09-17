import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Choice, Owner, type GameState } from '@rps/core';
import { RipsySocketClient, type ConnectionStatus } from '@rps/game-client/socket';
import { getGameWebSocketUrl } from '../config';
import { reportClientDiagnostic } from '../diagnostics';

export function useNativeRipsyGame(playerId: string, sessionToken: string, gameId?: string, enabled = true) {
  const clientRef = useRef<RipsySocketClient | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeGames, setActiveGames] = useState<GameState[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setStatus('suspended');
      return;
    }
    if (!playerId || !sessionToken) return;
    let endpoint: string;
    try {
      endpoint = getGameWebSocketUrl();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Game server configuration is invalid');
      return;
    }

    const client = new RipsySocketClient({ endpoint, playerId, sessionToken, diagnosticSink: reportClientDiagnostic });
    clientRef.current = client;
    const unsubscribeState = client.onState(setGameState);
    const unsubscribeStatus = client.onStatus(nextStatus => {
      setStatus(nextStatus);
      if (nextStatus === 'connected') setError(null);
    });
    const unsubscribeError = client.onError(cause => setError(cause.message));
    if (AppState.currentState === 'background') client.suspend();
    else client.connect(gameId);

    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') client.connect(gameId);
      else if (nextState === 'background') client.suspend();
    });

    return () => {
      subscription.remove();
      unsubscribeState();
      unsubscribeStatus();
      unsubscribeError();
      client.disconnect();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [enabled, gameId, playerId, sessionToken]);

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

  const actions = useMemo(() => ({
    listGames: () => run(async client => {
      const result = await client.request({ type: 'listGames' });
      const games = result.games ?? [];
      setActiveGames(games);
      return games;
    }),
    createGame: () => run(async client => {
      const result = await client.request({ type: 'createGame' });
      if (!result.gameId) throw new Error('The server did not return a game ID');
      return result.gameId;
    }),
    refresh: () => {
      if (!gameId) return Promise.resolve(null);
      return run(async client => (await client.request({ type: 'getGame', gameId })).state ?? null);
    },
    joinGame: () => {
      if (!gameId) return Promise.reject(new Error('Missing game ID'));
      return run(client => client.request({ type: 'joinGame', gameId }));
    },
    submitLineup: (xs: number[], ys: number[], pieces: number[], figureVariants?: number[]) => {
      if (!gameId) return Promise.reject(new Error('Missing game ID'));
      return run(client => client.request({ type: 'submitLineup', gameId, xs, ys, pieces, figureVariants }));
    },
    movePiece: (fromX: number, fromY: number, toX: number, toY: number) => {
      if (!gameId) return Promise.reject(new Error('Missing game ID'));
      return run(client => client.request({ type: 'movePiece', gameId, fromX, fromY, toX, toY }));
    },
    chooseWeapon: (choice: Choice) => {
      if (!gameId) return Promise.reject(new Error('Missing game ID'));
      return run(client => client.request({ type: 'chooseWeapon', gameId, choice }));
    },
  }), [gameId, run]);

  const isPlayer0 = Boolean(gameState && gameState.p0 === playerId);
  const isPlayer1 = Boolean(gameState && gameState.p1 === playerId);
  const ownOwner = isPlayer0 ? Owner.P0 : isPlayer1 ? Owner.P1 : Owner.None;
  const isMyTurn = Boolean(gameState && ((isPlayer0 && !gameState.isP1Turn) || (isPlayer1 && gameState.isP1Turn)));

  return {
    gameState,
    status,
    error,
    isBusy: pendingRequests > 0,
    isConnected: status === 'connected',
    isPlayer0,
    isPlayer1,
    ownOwner,
    isMyTurn,
    activeGames,
    ...actions,
  };
}
