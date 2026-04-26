"use client";
import { useState, useEffect } from 'react';
import { useSolanaWallet } from '../../hooks/useSolanaWallet';
import { useRpsGame, Phase, Choice, Piece, Owner, toIdx, toXY } from '@rps/solana-client';

interface SmartContractIntegrationProps {
  gamePda: string;
  onGameStateUpdate?: (gameState: any) => void;
}

export default function SmartContractIntegration({ 
  gamePda, 
  onGameStateUpdate 
}: SmartContractIntegrationProps) {
  const { connected, publicKey } = useSolanaWallet();
  const [isInitialized, setIsInitialized] = useState(false);
  
  const {
    gameState,
    loading,
    error,
    createGame,
    joinGame,
    placeFlag,
    submitLineup,
    movePiece,
    chooseWeapon,
    refreshGameState,
    isPlayerTurn,
    getAvailableMoves,
    isValidMove,
    isPlayer0,
    isPlayer1,
    isMyTurn,
  } = useRpsGame(gamePda);

  // Initialize game when component mounts
  useEffect(() => {
    if (connected && publicKey && !isInitialized) {
      initializeGame();
      setIsInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey, isInitialized]);

  const initializeGame = async () => {
    if (!gameState) {
      // Try to join existing game or create new one
      try {
        await joinGame(gamePda);
      } catch (err) {
        console.log('Game not found, creating new game...');
        await createGame();
      }
    }
  };

  // Notify parent component of game state changes
  useEffect(() => {
    if (gameState && onGameStateUpdate) {
      onGameStateUpdate(gameState);
    }
  }, [gameState, onGameStateUpdate]);

  // Smart contract actions that can be called from the parent component
  const smartContractActions = {
    placeFlag: async (x: number, y: number) => {
      try {
        await placeFlag(x, y);
        await refreshGameState();
      } catch (err) {
        console.error('Failed to place flag:', err);
        throw err;
      }
    },
    
    submitLineup: async (isP0: boolean, flagPos: number) => {
      try {
        await submitLineup(isP0, flagPos);
        await refreshGameState();
      } catch (err) {
        console.error('Failed to submit lineup:', err);
        throw err;
      }
    },
    
    movePiece: async (fromX: number, fromY: number, toX: number, toY: number) => {
      try {
        await movePiece(fromX, fromY, toX, toY);
        await refreshGameState();
      } catch (err) {
        console.error('Failed to move piece:', err);
        throw err;
      }
    },
    
    chooseWeapon: async (choice: Choice) => {
      try {
        await chooseWeapon(choice);
        await refreshGameState();
      } catch (err) {
        console.error('Failed to choose weapon:', err);
        throw err;
      }
    },
    
    refreshGameState: async () => {
      try {
        await refreshGameState();
      } catch (err) {
        console.error('Failed to refresh game state:', err);
        throw err;
      }
    }
  };

  // Convert smart contract board state to frontend format
  const convertBoardState = () => {
    if (!gameState) return { owners: [], pieces: [] };
    
    const owners: number[] = [];
    const pieces: number[] = [];
    
    for (let i = 0; i < 42; i++) {
      owners.push(gameState.owners[i] || 0);
      pieces.push(gameState.pieces[i] || 0);
    }
    
    return { owners, pieces };
  };

  // Get available moves for a piece
  const getAvailableMovesForPiece = (fromX: number, fromY: number) => {
    if (!gameState) return [];
    return getAvailableMoves(fromX, fromY);
  };

  // Check if a move is valid
  const isMoveValid = (fromX: number, fromY: number, toX: number, toY: number) => {
    if (!gameState) return false;
    return isValidMove(fromX, fromY, toX, toY);
  };

  // Check if it's the player's turn
  const isPlayerTurnNow = (isPlayer1: boolean) => {
    return isPlayerTurn(isPlayer1);
  };

  // Get game phase
  const getGamePhase = () => {
    return gameState?.phase || Phase.Created;
  };

  // Check if there's a tie pending
  const isTiePending = () => {
    return gameState?.tiePending || false;
  };

  // Get tie information
  const getTieInfo = () => {
    if (!gameState?.tiePending) return null;
    return {
      from: gameState.tieFrom,
      to: gameState.tieTo
    };
  };

  // Get player information
  const getPlayerInfo = () => {
    return {
      isPlayer0,
      isPlayer1,
      isMyTurn,
      p0: gameState?.p0 || '',
      p1: gameState?.p1 || '',
      winner: gameState?.winner || null
    };
  };

  // Get game statistics
  const getGameStats = () => {
    if (!gameState) return null;
    return {
      live0: gameState.live0,
      live1: gameState.live1,
    };
  };

  // Expose the smart contract integration to parent component
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).smartContractIntegration = {
        gameState,
        loading,
        error,
        actions: smartContractActions,
        utils: {
          convertBoardState,
          getAvailableMovesForPiece,
          isMoveValid,
          isPlayerTurnNow,
          getGamePhase,
          isTiePending,
          getTieInfo,
          getPlayerInfo,
          getGameStats
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, loading, error, smartContractActions]);

  // Show loading state
  if (loading) {
    return (
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        background: 'rgba(0,0,0,0.8)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{ color: '#66fcf1', fontSize: '18px' }}>Loading game state...</div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div style={{ 
        position: 'fixed', 
        top: 20, 
        right: 20, 
        background: '#ff6b6b', 
        color: 'white', 
        padding: '12px 16px', 
        borderRadius: '8px',
        zIndex: 1000
      }}>
        <div>Error: {error}</div>
        <button 
          onClick={refreshGameState}
          style={{ 
            marginTop: '8px', 
            padding: '4px 8px', 
            background: 'white', 
            color: '#ff6b6b', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Show wallet connection prompt
  if (!connected) {
    return (
      <div style={{ 
        position: 'fixed', 
        top: 20, 
        right: 20, 
        background: '#ffa500', 
        color: 'white', 
        padding: '12px 16px', 
        borderRadius: '8px',
        zIndex: 1000
      }}>
        Please connect your wallet to play
      </div>
    );
  }

  // Return null if everything is working (the integration is handled via window object)
  return null;
}
