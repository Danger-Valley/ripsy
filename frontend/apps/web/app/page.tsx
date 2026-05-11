"use client";
import { useSolanaWallet } from './hooks/useSolanaWallet';
import { WalletMultiButton } from './components/WalletMultiButton';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useRipsyGame } from '@rps/solana-client';

export default function HomePage() {
  const { connected, publicKey } = useSolanaWallet();
  const router = useRouter();
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [isCreatingPrivateGame, setIsCreatingPrivateGame] = useState(false);
  
  // Initialize smart contract integration
  const { createGame, finishGame, finishPlayerData, loading, error } = useRipsyGame();

  const handleStartGame = async () => {
    if (!connected || !publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (isCreatingGame || loading) {
      toast.error('Game creation already in progress');
      return;
    }

    setIsCreatingGame(true);
    toast.loading('Creating game...', { id: 'create-game' });

    try {
      const { gamePda } = await createGame();
      toast.success(`Game created! PDA: ${gamePda}`, { id: 'create-game' });
      
      // Navigate to the game page
      router.push(`/game/${gamePda}`);
    } catch (err) {
      console.error('Failed to create game:', err);
      toast.error(`Failed to create game: ${err}`, { id: 'create-game' });
    } finally {
      setIsCreatingGame(false);
    }
  };

  const handleStartPrivateGame = async () => {
    if (!connected || !publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }

    setIsCreatingPrivateGame(true);
    toast.loading('Creating private game...', { id: 'create-private-game' });

    try {
      const { gamePda } = await createGame();
      toast.success(`Private game created! PDA: ${gamePda}`, { id: 'create-private-game' });
      
      // Navigate to the game page
      router.push(`/game/${gamePda}`);
    } catch (err) {
      console.error('Failed to create private game:', err);
      toast.error(`Failed to create private game: ${err}`, { id: 'create-private-game' });
    } finally {
      setIsCreatingPrivateGame(false);
    }
  };

  return (
    <main style={{
      padding: 24,
      fontFamily: 'system-ui, sans-serif',
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0e1419',
      gap: 16
    }}>
      <h1 style={{ margin: 0, color: '#66fcf1' }}>RIPSY</h1>
      <p style={{ color: '#c5c6c7', textAlign: 'center', maxWidth: '400px' }}>
        Battle with Rock, Paper, Scissors on the blockchain! 
        Create a game and invite friends to join the ultimate strategy battle.
      </p>
      
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <WalletMultiButton />
        
        <button
          style={{ 
            padding: '12px 24px',
            background: connected ? '#66fcf1' : '#666',
            color: connected ? '#1a1a1a' : '#999',
            border: 'none',
            borderRadius: '8px',
            cursor: connected && !isCreatingGame ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
            transition: 'all 0.2s ease',
            opacity: connected && !isCreatingGame ? 1 : 0.6
          }}
                 disabled={!connected || isCreatingGame || isCreatingPrivateGame || loading}
                 onClick={handleStartGame}
        >
          {isCreatingGame ? 'Creating...' : 'Start Game'}
        </button>
        
        {/* <button
          style={{ 
            padding: '12px 24px',
            background: connected ? '#ff6b6b' : '#666',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: connected && !isCreatingPrivateGame ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
            transition: 'all 0.2s ease',
            opacity: connected && !isCreatingPrivateGame ? 1 : 0.6
          }}
                 disabled={!connected || isCreatingGame || isCreatingPrivateGame || loading}
                 onClick={handleStartPrivateGame}
        >
          {isCreatingPrivateGame ? 'Creating...' : 'Start Private Game'}
        </button> */}
      </div>

      {error && (
        <div style={{
          background: '#ff6b6b',
          color: 'white',
          padding: '12px 16px',
          borderRadius: '8px',
          marginTop: '16px',
          maxWidth: '400px',
          textAlign: 'center'
        }}>
          Error: {error}
        </div>
      )}

      {loading && (
        <div style={{
          background: '#66fcf1',
          color: '#1a1a1a',
          padding: '12px 16px',
          borderRadius: '8px',
          marginTop: '16px'
        }}>
          Loading smart contract...
        </div>
      )}

      <div style={{
        marginTop: '32px',
        padding: '20px',
        background: '#0e1419',
        border: '1px solid #2b3a44',
        borderRadius: '8px',
        maxWidth: '600px',
        textAlign: 'center'
      }}>
        <h3 style={{ color: '#66fcf1', marginTop: 0 }}>How to Play</h3>
        <div style={{ color: '#c5c6c7', lineHeight: '1.6' }}>
          <p>0. Switch your Solana wallet to Devnet</p>
          <p>1. Connect your Solana wallet</p>
          <p>2. Click &quot;Start Game&quot; to create a new game</p>
          <p>3. Share the game ID with friends to invite them</p>
          <p>4. Set up your pieces</p>
          <p>5. Battle with Rock, Paper, Scissors strategy!</p>
        </div>
      </div>
    </main>
  );
}

