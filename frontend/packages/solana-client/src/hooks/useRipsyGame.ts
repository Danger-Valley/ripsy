import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet, useTransactionSigner } from '@solana/connector/react';
import { useConnectorClient } from '@solana/connector';
import * as anchor from '@coral-xyz/anchor';
import { Phase, Choice, Piece, Owner, isEmptyAddress } from '../index';
import { useRipsyContext } from '../context';
import { r } from 'node_modules/@solana/connector/dist/standard-shim-BB0Lkg_C';

export interface GameState {
  gamePda: anchor.web3.PublicKey;
  phase: Phase;
  isP1Turn: boolean;
  owners: Owner[];
  pieces: Piece[];
  live0: number;
  live1: number;
  attacker: number,
  defender: number,
  outcome: number,
  playerChoice: Choice;
  tiePending: boolean;
  tieFrom: { x: number; y: number };
  tieTo: { x: number; y: number };
  p0: string;
  p1: string;
  winner: string | null;
}

export interface useRipsyGameReturn {
  // Game state
  gameState: GameState | null;
  loading: boolean;
  error: string | null;

  // Game actions
  createGame: () => Promise<{ gamePda: string }>;
  joinGame: (gamePda: string) => Promise<void>;
  submitLineup: (isP0: boolean, flagPos: number) => Promise<void>;
  submitCustomLineup: (xs: number[], ys: number[], pieces: number[]) => Promise<void>;
  movePiece: (fromX: number, fromY: number, toX: number, toY: number) => Promise<void>;
  chooseWeapon: (choice: Choice) => Promise<void>;
  finishGame: () => Promise<void>;
  finishPlayerData: () => Promise<void>;

  // Game utilities
  refreshGameState: () => Promise<void>;
  refreshFreshGameState: () => Promise<GameState | null>;
  isPlayerTurn: (isPlayer1: boolean) => boolean;
  getAvailableMoves: (fromX: number, fromY: number) => { x: number; y: number }[];
  isValidMove: (fromX: number, fromY: number, toX: number, toY: number) => boolean;
  isPlayerChoice: () => boolean;
  isInitialized: boolean;

  // Game info
  isPlayer0: boolean;
  isPlayer1: boolean;
  isMyTurn: boolean;
}

export function useRipsyGame(gamePda?: string): useRipsyGameReturn {
  const { isConnected, account } = useWallet();
  const { signer, ready } = useTransactionSigner();
  const connectorClient = useConnectorClient();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { gameClient } = useRipsyContext();
  const [isInitialized, setIsInitialized] = useState(false);
  const initializingRef = useRef(false);

  // Initialize game client when wallet connects (ConnectorKit signer + Kit-backed Connection)
  useEffect(() => {
    if (!isConnected || !account || !ready || !signer) {
      console.log('Wallet not ready:', {
        isConnected,
        account: !!account,
        ready,
        signer: !!signer,
      });

      setGameState(null);
      return;
    }
  }, [isConnected, account, ready, signer, connectorClient]);

  useEffect(() => {
    if (!gameClient || !gamePda) return;
    if (initializingRef.current) return;

    initializingRef.current = true;
    setIsInitialized(false);
    setError(null);

    gameClient
      .initGame(new anchor.web3.PublicKey(gamePda))
      .then(() => setIsInitialized(true))
      .catch((err) => {
        setError(`Failed to initialize game session: ${err}`);
        setIsInitialized(false);
        initializingRef.current = false;
      });
  }, [gameClient, gamePda]);

  useEffect(() => {
    if (isInitialized) {
      loadGameState();
    }
  }, [isInitialized]);

  const loadGameState = useCallback(async () => {
    if (!gameClient || !gamePda) return;

    setLoading(true);
    setError(null);

    try {
      const gamePdaKey = new anchor.web3.PublicKey(gamePda);

      const state = await gameClient.getGameState();
      const playerDataState = await gameClient.getPlayerDataState();

      const freshState = {
        gamePda: gamePdaKey,
        ...state,
        pieces: playerDataState ? playerDataState.pieces : [],
        playerChoice: playerDataState ? playerDataState.choice : Choice.None,
        phase: state.phase as Phase
      };

      setGameState(freshState);

      console.log('=== GAME STATE ===');
      console.log(freshState);

      return freshState;
    } catch (err) {
      setError(`Failed to load game state: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [gameClient, gamePda, gameState]);

  useEffect(() => {
    if (!gameClient || !isInitialized) return;
    if (gameState && gameState?.phase !== undefined && gameState?.phase > 4) return;

    const unsubscribe = gameClient.subscribeToGameChanges(() => {
      loadGameState();
    });

    return () => unsubscribe();
  }, [gameClient, isInitialized, gameState?.phase, loadGameState]);

  const createGame = useCallback(async (): Promise<{ gamePda: string }> => {
    if (!gameClient) {
      setError('Game client not initialized');
      throw new Error('Game client not initialized');
    }

    if (loading) {
      throw new Error('Game creation already in progress');
    }

    setLoading(true);
    setError(null);

    try {
      const { gamePda } = await gameClient.createGame();

      return { gamePda: gamePda.toString() };
    } catch (err) {
      console.error('Create game error:', err);
      setError(`Failed to create game: ${err}`);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [gameClient, loading]);

  const finishGame = useCallback(async (): Promise<void> => {
    if (!gameClient) {
      setError('Game client not initialized');
      throw new Error('Game client not initialized');
    }
    setLoading(true);
    setError(null);

    try {
      await gameClient.finishGame();
    } catch (err) {
      console.error('Finish game error:', err);
      setError(`Failed to finish game: ${err}`);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [gameClient, loading]);

  const finishPlayerData = useCallback(async (): Promise<void> => {
    if (!gameClient) {
      setError('Game client not initialized');
      throw new Error('Game client not initialized');
    }
    setLoading(true);
    setError(null);

    try {
      await gameClient.finishPlayerData();
    } catch (err) {
      console.error('Finish PlayerData error:', err);
      setError(`Failed to finish PlayerData: ${err}`);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [gameClient, loading]);

  const joinGame = useCallback(async (gamePda: string) => {
    if (!gameClient) {
      setError('Game client not initialized');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const gamePdaKey = new anchor.web3.PublicKey(gamePda);
      await gameClient.joinGame(gamePdaKey);
    } catch (err) {
      console.error('Join game error:', err);

      let errorMsg = '';
      if (err instanceof Error) {
        if (err.message.includes('already been processed')) {
          errorMsg = 'You have already joined this game';
        } else if (err.message.includes('already full')) {
          errorMsg = 'This game is already full';
        } else if (err.message.includes('already in this game')) {
          errorMsg = 'You are already in this game';
        } else {
          errorMsg = `Failed to join game: ${err.message}`;
        }
      } else {
        errorMsg = `Failed to join game: ${err}`;
      }
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [gameClient]);

  const submitLineup = useCallback(async (isP0: boolean, flagPos: number) => {
    if (!gameClient || !gameState) {
      const error = 'Game client not initialized or no game state';
      setError(error);
      throw new Error(error);
    }

    setLoading(true);
    setError(null);

    try {
      await gameClient.submitLineup(isP0, flagPos);
    } catch (err) {
      const errorMsg = `Failed to submit lineup: ${err}`;
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [gameClient, gameState]);

  const submitCustomLineup = useCallback(async (xs: number[], ys: number[], pieces: number[]) => {
    if (!gameClient || !gameState) {
      const error = 'Game client not initialized or no game state';
      setError(error);
      throw new Error(error);
    }

    setLoading(true);
    setError(null);

    try {
      await gameClient.submitCustomLineup(xs, ys, pieces);
    } catch (err) {
      const errorMsg = `Failed to submit custom lineup: ${err}`;
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [gameClient, gameState]);

  const movePiece = useCallback(async (fromX: number, fromY: number, toX: number, toY: number) => {
    if (!gameClient || !gameState) {
      const error = 'Game client not initialized or no game state';
      setError(error);
      throw new Error(error);
    }

    setLoading(true);
    setError(null);

    try {
      await gameClient.movePiece(fromX, fromY, toX, toY);
    } catch (err) {
      const errorMsg = `Failed to move piece: ${err}`;
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [gameClient, gameState]);

  const chooseWeapon = useCallback(async (choice: Choice) => {
    if (!gameClient || !gameState) {
      const error = 'Game client not initialized or no game state';
      setError(error);
      throw new Error(error);
    }

    setLoading(true);
    setError(null);

    try {
      await gameClient.chooseWeapon(choice);
    } catch (err) {
      const errorMsg = `Failed to choose weapon: ${err}`;
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [gameClient, gameState]);

  const refreshGameState = useCallback(async () => {
    await loadGameState();
  }, [loadGameState]);

  const refreshFreshGameState = useCallback(async () => {
    return await loadGameState() ?? null;
  }, [loadGameState]);

  const isPlayerTurn = useCallback((isPlayer1: boolean) => {
    return gameState?.isP1Turn === isPlayer1;
  }, [gameState]);

  const isPlayerChoice = useCallback(() => {
    if (!gameState) return false;

    return gameState.playerChoice !== undefined && gameState.playerChoice != Choice.None;
  }, [gameState]);

  const getAvailableMoves = useCallback((fromX: number, fromY: number) => {
    if (!gameState) return [];
    return gameClient?.getAvailableMoves(fromX, fromY, gameState.owners, gameState.pieces) || [];
  }, [gameClient, gameState]);

  const isValidMove = useCallback((fromX: number, fromY: number, toX: number, toY: number) => {
    if (!gameState) return false;
    return gameClient?.isValidMove(fromX, fromY, toX, toY, gameState.owners, gameState.pieces) || false;
  }, [gameClient, gameState]);

  const isPlayer0 =
    !!account &&
    gameState?.p0?.toString() === account &&
    !isEmptyAddress(gameState?.p0?.toString());
  const isPlayer1 =
    !!account &&
    gameState?.p1?.toString() === account &&
    !isEmptyAddress(gameState?.p1?.toString());
  const isMyTurn = gameState ? isPlayerTurn(isPlayer1) : false;

  if (gameState && account) {
    // console.log('Hook player detection:', {
    //   userAddress: account,
    //   p0: gameState.p0?.toString(),
    //   p1: gameState.p1?.toString(),
    //   isEmptyP0: isEmptyAddress(gameState.p0?.toString()),
    //   isEmptyP1: isEmptyAddress(gameState.p1?.toString()),
    //   isPlayer0,
    //   isPlayer1,
    //   phase: gameState.phase
    // });
  }

  return {
    gameState,
    loading,
    error,
    createGame,
    joinGame,
    submitLineup,
    submitCustomLineup,
    movePiece,
    chooseWeapon,
    refreshGameState,
    refreshFreshGameState,
    isPlayerTurn,
    isPlayerChoice,
    getAvailableMoves,
    isValidMove,
    isPlayer0,
    isPlayer1,
    isMyTurn,
    finishGame,
    finishPlayerData,
    isInitialized
  };
}
