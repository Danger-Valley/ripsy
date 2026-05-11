"use client";
import { useState, useEffect } from 'react';
import { useSolanaWallet } from '../../../hooks/useSolanaWallet';
import { useRipsyGame } from '@rps/solana-client';
import { useParams } from 'next/navigation';

export default function TestPage() {
  const { connected, publicKey } = useSolanaWallet();
  const { id } = useParams<{ id: string }>();
  const gamePda = id as string;
  const [testResults, setTestResults] = useState<string[]>([]);
  
  const { 
    gameState, 
    loading, 
    error, 
    createGame, 
    joinGame,
    refreshGameState 
  } = useRipsyGame(gamePda);

  const addTestResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`]);
  };

  const runTests = async () => {
    setTestResults([]);
    addTestResult('Starting smart contract integration tests...');
    
    if (!connected) {
      addTestResult('❌ Wallet not connected');
      return;
    }
    
    addTestResult('✅ Wallet connected');
    addTestResult(`Public key: ${publicKey?.toString()}`);
    
    if (loading) {
      addTestResult('⏳ Loading game state...');
    }
    
    if (error) {
      addTestResult(`❌ Error: ${error}`);
    }
    
    if (gameState) {
      addTestResult('✅ Game state loaded');
      addTestResult(`Game PDA: ${gameState.gamePda}`);
      addTestResult(`Phase: ${gameState.phase}`);
      addTestResult(`Player 0: ${gameState.p0}`);
      addTestResult(`Player 1: ${gameState.p1}`);
    } else {
      addTestResult('ℹ️ No game state (this is normal for new games)');
    }
    
    // Test creating a game
    try {
      addTestResult('🔄 Testing game creation...');
      const result = await createGame();
      addTestResult(`✅ Game created successfully! PDA: ${result.gamePda}`);
    } catch (err) {
      addTestResult(`❌ Failed to create game: ${err}`);
    }
  };

  useEffect(() => {
    if (connected) {
      runTests();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'monospace', 
      background: '#1a1a1a', 
      color: '#00ff00',
      minHeight: '100vh'
    }}>
      <h1 style={{ color: '#66fcf1', marginBottom: '20px' }}>
        Smart Contract Integration Test
      </h1>
      
      <div style={{ marginBottom: '20px' }}>
        <strong>Status:</strong>
        <br />
        Wallet Connected: {connected ? '✅' : '❌'}
        <br />
        Public Key: {publicKey?.toString() || 'Not connected'}
        <br />
        Loading: {loading ? '⏳' : '✅'}
        <br />
        Error: {error || 'None'}
        <br />
        Game PDA: {gamePda}
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={runTests}
          style={{
            padding: '10px 20px',
            background: '#66fcf1',
            color: '#1a1a1a',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          Run Tests
        </button>
        
        <button 
          onClick={() => setTestResults([])}
          style={{
            padding: '10px 20px',
            background: '#ff6b6b',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Clear Results
        </button>
      </div>
      
      <div style={{ 
        background: '#000', 
        padding: '15px', 
        borderRadius: '5px',
        maxHeight: '400px',
        overflowY: 'auto'
      }}>
        <h3 style={{ color: '#66fcf1', marginTop: 0 }}>Test Results:</h3>
        {testResults.length === 0 ? (
          <div style={{ color: '#666' }}>No test results yet. Click &quot;Run Tests&quot; to start.</div>
        ) : (
          testResults.map((result, index) => (
            <div key={index} style={{ marginBottom: '5px' }}>
              {result}
            </div>
          ))
        )}
      </div>
      
      {gameState && (
        <div style={{ 
          marginTop: '20px', 
          background: '#222', 
          padding: '15px', 
          borderRadius: '5px' 
        }}>
          <h3 style={{ color: '#66fcf1' }}>Current Game State:</h3>
          <pre style={{ color: '#00ff00', fontSize: '12px' }}>
            {JSON.stringify(gameState, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
