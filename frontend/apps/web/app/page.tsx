"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { usePlayerIdentity, useRipsyGame } from '@rps/game-client';
import { PlayerBadge } from './components/PlayerBadge';

export default function HomePage() {
  const router = useRouter();
  const { playerId } = usePlayerIdentity();
  const { createGame, loading, error, isInitialized } = useRipsyGame();
  const [creating, setCreating] = useState(false);

  const handleStartGame = async () => {
    setCreating(true);
    toast.loading('Creating game...', { id: 'create-game' });
    try {
      const { gameId } = await createGame();
      toast.success('Game created', { id: 'create-game' });
      router.push(`/game/${gameId}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not create game', { id: 'create-game' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0e1419', gap: 16 }}>
      <h1 style={{ margin: 0, color: '#66fcf1' }}>RIPSY</h1>
      <p style={{ color: '#c5c6c7', textAlign: 'center', maxWidth: 440 }}>
        A real-time Rock, Paper, Scissors strategy battle. Create a room, share its link, and play instantly.
      </p>

      <PlayerBadge playerId={playerId} />
      <button
        onClick={handleStartGame}
        disabled={!isInitialized || creating || loading}
        style={{ padding: '12px 24px', background: isInitialized ? '#66fcf1' : '#2b3a44', color: isInitialized ? '#1a1a1a' : '#8a9ba8', border: 0, borderRadius: 8, cursor: isInitialized && !creating ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}
      >
        {creating ? 'Creating…' : isInitialized ? 'Start Game' : 'Connecting to server…'}
      </button>

      {error && <div style={{ color: '#ff6b6b' }}>{error}</div>}

      <div style={{ marginTop: 32, padding: 20, border: '1px solid #2b3a44', borderRadius: 8, maxWidth: 600, textAlign: 'center' }}>
        <h3 style={{ color: '#66fcf1', marginTop: 0 }}>How to play</h3>
        <div style={{ color: '#c5c6c7', lineHeight: 1.6 }}>
          <p>1. Create a game and share the room link.</p>
          <p>2. Both players arrange and submit their pieces.</p>
          <p>3. Take turns moving and resolve battles with Rock, Paper, Scissors.</p>
          <p>4. Capture the opposing flag to win.</p>
        </div>
      </div>

      <nav aria-label="Legal and support" style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 13 }}>
        <a href="/download" style={{ color: '#66fcf1' }}>Download Android</a>
        <a href="/terms" style={{ color: '#8a9ba8' }}>Terms</a>
        <a href="/privacy" style={{ color: '#8a9ba8' }}>Privacy</a>
        <a href="/support" style={{ color: '#8a9ba8' }}>Support</a>
      </nav>
    </main>
  );
}
