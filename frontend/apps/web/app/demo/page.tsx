"use client";
import { useState } from 'react';
import { useSolanaWallet } from '../hooks/useSolanaWallet';
import { WalletMultiButton } from '../components/WalletMultiButton';
import { useRpsGame } from '@rps/solana-client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function DemoPage() {
  const { connected, publicKey } = useSolanaWallet();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [gamePda, setGamePda] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  // Initialize smart contract integration
  const { createGame, loading, error } = useRpsGame();

  const handleCreateGame = async () => {
    if (!connected || !publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }

    setIsCreating(true);
    toast.loading('Creating game on blockchain...', { id: 'create-game' });

    try {
      const { gamePda: newGamePda } = await createGame();
      setGamePda(newGamePda);
      setStep(2);
      toast.success(`Game created! PDA: ${newGamePda}`, { id: 'create-game' });
    } catch (err) {
      console.error('Failed to create game:', err);
      toast.error(`Failed to create game: ${err}`, { id: 'create-game' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinGame = () => {
    if (gamePda) {
      router.push(`/game/${gamePda}`);
    }
  };

  return (
    <div style={{
      padding: '40px',
      fontFamily: 'system-ui, sans-serif',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
      color: 'white'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ 
          color: '#66fcf1', 
          textAlign: 'center', 
          marginBottom: '40px',
          fontSize: '2.5rem'
        }}>
          Smart Contract Integration Demo
        </h1>

        <div style={{
          background: '#0e1419',
          border: '1px solid #2b3a44',
          borderRadius: '12px',
          padding: '30px',
          marginBottom: '30px'
        }}>
          <h2 style={{ color: '#66fcf1', marginTop: 0 }}>Step 1: Connect Wallet</h2>
          <p style={{ color: '#c5c6c7', marginBottom: '20px' }}>
            First, connect your Solana wallet to interact with the smart contract.
          </p>
          
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <WalletMultiButton />
          </div>
          
          {connected && (
            <div style={{
              marginTop: '20px',
              padding: '15px',
              background: '#1a3d1a',
              border: '1px solid #4a7c59',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              ✅ Wallet Connected: {publicKey?.toString().slice(0, 8)}...
            </div>
          )}
        </div>

        {connected && (
          <div style={{
            background: '#0e1419',
            border: '1px solid #2b3a44',
            borderRadius: '12px',
            padding: '30px',
            marginBottom: '30px'
          }}>
            <h2 style={{ color: '#66fcf1', marginTop: 0 }}>Step 2: Create Game</h2>
            <p style={{ color: '#c5c6c7', marginBottom: '20px' }}>
              Click the button below to create a new game on the blockchain. 
              This will send a transaction that you&apos;ll need to sign with your wallet.
            </p>
            
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={handleCreateGame}
                disabled={isCreating || loading}
                style={{
                  padding: '15px 30px',
                  background: isCreating || loading ? '#666' : '#66fcf1',
                  color: isCreating || loading ? '#999' : '#1a1a1a',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isCreating || loading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  transition: 'all 0.2s ease'
                }}
              >
                {isCreating ? 'Creating Game...' : 'Create Game on Blockchain'}
              </button>
            </div>

            {error && (
              <div style={{
                marginTop: '20px',
                padding: '15px',
                background: '#3d1a1a',
                border: '1px solid #7c4a4a',
                borderRadius: '8px',
                color: '#ff6b6b'
              }}>
                ❌ Error: {error}
              </div>
            )}

            {loading && (
              <div style={{
                marginTop: '20px',
                padding: '15px',
                background: '#1a3d3d',
                border: '1px solid #4a7c7c',
                borderRadius: '8px',
                color: '#66fcf1',
                textAlign: 'center'
              }}>
                ⏳ Loading smart contract...
              </div>
            )}
          </div>
        )}

        {gamePda && (
          <div style={{
            background: '#0e1419',
            border: '1px solid #2b3a44',
            borderRadius: '12px',
            padding: '30px',
            marginBottom: '30px'
          }}>
            <h2 style={{ color: '#66fcf1', marginTop: 0 }}>Step 3: Game Created!</h2>
            <p style={{ color: '#c5c6c7', marginBottom: '20px' }}>
              Your game has been created on the blockchain! Game PDA: <strong>{gamePda}</strong>
            </p>
            
            <div style={{
              padding: '20px',
              background: '#1a3d1a',
              border: '1px solid #4a7c59',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <h3 style={{ color: '#66fcf1', marginTop: 0 }}>What happened?</h3>
              <ul style={{ color: '#c5c6c7', lineHeight: '1.6' }}>
                <li>✅ Smart contract transaction sent to Solana blockchain</li>
                <li>✅ You signed the transaction with your wallet</li>
                <li>✅ Game state stored on-chain</li>
                <li>✅ Game PDA generated: {gamePda}</li>
              </ul>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button
                onClick={handleJoinGame}
                style={{
                  padding: '15px 30px',
                  background: '#ff6b6b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  marginRight: '10px'
                }}
              >
                Enter Game
              </button>
              
              <button
                onClick={() => {
                  navigator.clipboard.writeText(gamePda);
                  toast.success('Game PDA copied to clipboard!');
                }}
                style={{
                  padding: '15px 30px',
                  background: '#2b3a44',
                  color: '#c5c6c7',
                  border: '1px solid #4a7c59',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '16px'
                }}
              >
                Copy Game PDA
              </button>
            </div>
          </div>
        )}

        <div style={{
          background: '#0e1419',
          border: '1px solid #2b3a44',
          borderRadius: '12px',
          padding: '30px'
        }}>
          <h2 style={{ color: '#66fcf1', marginTop: 0 }}>How It Works</h2>
          <div style={{ color: '#c5c6c7', lineHeight: '1.6' }}>
            <p><strong>1. Wallet Connection:</strong> Your Solana wallet connects to the app</p>
            <p><strong>2. Smart Contract:</strong> The app interacts with your deployed Solana program</p>
            <p><strong>3. Transaction:</strong> Game creation sends a transaction to the blockchain</p>
            <p><strong>4. Signing:</strong> You sign the transaction with your private key</p>
            <p><strong>5. Confirmation:</strong> The transaction is confirmed and game is created</p>
            <p><strong>6. Game State:</strong> All game data is stored on-chain and can be accessed by anyone</p>
          </div>
        </div>
      </div>
    </div>
  );
}
