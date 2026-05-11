# Smart Contract Integration Guide

This guide explains how to integrate your Solana smart contract with the frontend game.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd packages/solana-client
npm install
```

### 2. Test the Integration
Visit `/game/1/test` to run the integration test page and verify everything is working.

### 3. Choose Your Integration Approach

## 📁 Integration Options

### Option A: Full Smart Contract Page
**File:** `page-smart-contract.tsx`
- Complete smart contract integration
- Real-time blockchain state
- All game logic handled by smart contract

### Option B: Integration Component
**File:** `SmartContractIntegration.tsx`
- Drop-in component for existing pages
- Minimal code changes required
- Gradual migration approach

### Option C: Example Integration
**File:** `page-integration-example.tsx`
- Shows how to integrate with existing game logic
- Hybrid approach (local + blockchain)
- Reference implementation

## 🔧 Smart Contract Client

The `@rps/solana-client` package provides:

### Core Classes
- `RpsGameClient` - Main client for smart contract interaction
- `useRipsyGame` - React hook for easy integration

### Key Methods
```typescript
// Game lifecycle
await createGame()
await joinGame(gameId)
await submitLineup(isP0, flagPos)

// Gameplay
await movePiece(fromX, fromY, toX, toY)
await chooseWeapon(choice)

// State management
await refreshGameState()
const gameState = await getGameState()
```

### Game State
```typescript
interface GameState {
  gameId: number
  phase: Phase
  isP1Turn: boolean
  owners: Owner[]
  pieces: Piece[]
  live0: number
  live1: number
  tiePending: boolean
  // ... more fields
}
```

## 🎮 Game Phases

1. **Created** - Game created, waiting for second player
2. **Joined** - Both players joined, place flags
3. **Active** - Game active, make moves
4. **Finished** - Game completed

## 🔄 Integration Examples

### Basic Integration
```typescript
import { useRipsyGame } from '@rps/solana-client';

function MyGameComponent() {
  const { gameState, createGame, movePiece } = useRipsyGame(gameId);
  
  const handleMove = async (fromX, fromY, toX, toY) => {
    await movePiece(fromX, fromY, toX, toY);
  };
  
  return (
    <div>
      <button onClick={createGame}>Create Game</button>
      {/* Your game UI */}
    </div>
  );
}
```

### With Error Handling
```typescript
const { gameState, loading, error, createGame } = useRipsyGame(gameId);

if (loading) return <div>Loading...</div>;
if (error) return <div>Error: {error}</div>;
if (!gameState) return <div>No game state</div>;

// Your game UI
```

## 🛠️ Customization

### Custom Game Client
```typescript
import { RpsGameClient } from '@rps/solana-client';

const client = new RpsGameClient(provider);
await client.createGame();
```

### Custom Hooks
```typescript
function useMyGameLogic(gameId: number) {
  const game = useRipsyGame(gameId);
  
  // Add your custom logic here
  
  return {
    ...game,
    customMethod: () => { /* your logic */ }
  };
}
```

## 🐛 Troubleshooting

### Common Issues

1. **Wallet not connected**
   - Ensure wallet is connected before using smart contract methods

2. **Transaction failures**
   - Check if you have enough SOL for transaction fees
   - Verify the smart contract is deployed

3. **Game state not updating**
   - Call `refreshGameState()` after transactions
   - Check network connection

4. **TypeScript errors**
   - Ensure all dependencies are installed
   - Check TypeScript configuration

### Debug Mode
```typescript
// Enable debug logging
const { gameState, ... } = useRipsyGame(gameId, { debug: true });
```

## 📚 API Reference

### RpsGameClient Methods
- `createGame()` - Create new game
- `joinGame(gamePda)` - Join existing game
- `submitLineup(gamePda, isP0, flagPos)` - Submit lineup
- `movePiece(gamePda, fromX, fromY, toX, toY)` - Move piece
- `chooseWeapon(gamePda, choice)` - Choose weapon for tie
- `getGameState(gamePda)` - Get current game state
- `isPlayerTurn(gamePda, isPlayer1)` - Check if it's player's turn

### useRipsyGame Hook
- `gameState` - Current game state
- `loading` - Loading state
- `error` - Error message
- `createGame()` - Create game action
- `joinGame(gameId)` - Join game action
- `submitLineup(isP0, flagPos)` - Submit lineup action
- `movePiece(fromX, fromY, toX, toY)` - Move piece action
- `chooseWeapon(choice)` - Choose weapon action
- `refreshGameState()` - Refresh game state

## 🎯 Next Steps

1. **Test the integration** using the test page
2. **Choose your integration approach** (A, B, or C)
3. **Customize as needed** for your specific requirements
4. **Deploy and test** with real transactions

## 📞 Support

If you encounter issues:
1. Check the console for error messages
2. Verify wallet connection
3. Ensure smart contract is deployed
4. Check network connectivity

Happy coding! 🚀
