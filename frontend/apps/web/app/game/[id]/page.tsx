"use client";
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useRiveFile } from '@rive-app/react-canvas';
import { useParams } from 'next/navigation';
import { useSolanaWallet } from '../../hooks/useSolanaWallet';
import { WalletMultiButton } from '../../components/WalletMultiButton';
import { toast } from 'sonner';
import { useRipsyGame, isEmptyAddress, Owner, HEIGHT, WIDTH, Choice } from '@rps/solana-client';
import RpsFigure, { Weapon, WEAPON_NAMES } from './RpsFigure';
import WeaponSelectionPopup from './WeaponSelectionPopup';

interface Figure {
  id: string;
  row: number;
  col: number;
  weapon?: Weapon; // Optional weapon for opponent pieces
  isMyFigure: boolean;
  isAlive: boolean;
  isMoving?: boolean;
  oldRow?: number;
  oldCol?: number;
  animX?: number;
  animY?: number;
  isOpponentPlaceholder?: boolean; // Add for debugging
  isTrap?: boolean; // Add to indicate if this is a trap piece
}

// Game constants
const DISTANCE_BETWEEN_FIGURES_DURING_ATTACK = 40;

export default function GamePage() {
  // Load shared Rive file once and share across all figures
  const { riveFile, status: riveStatus } = useRiveFile({ src: '/figures/fig1.riv' });
  const { id } = useParams<{ id: string }>();
  const { connected, publicKey } = useSolanaWallet();
  const gamePda = id || '';

  // Initialize smart contract integration
  const {
    gameState,
    loading: gameLoading,
    error: gameError,
    refreshGameState,
    joinGame,
    submitCustomLineup,
    movePiece,
    chooseWeapon,
    isPlayer0,
    isPlayer1,
    isMyTurn,
    isPlayerChoice,
    isInitialized,
  } = useRipsyGame(gamePda);
  const rows = HEIGHT;
  const cols = WIDTH;
  const cells = useMemo(() => Array.from({ length: rows * cols }), []);

  // Track window size for responsive calculations
  const [windowWidth, setWindowWidth] = useState(0);
  const [boardRef, setBoardRef] = useState<HTMLDivElement | null>(null);

  // Authorization and game state management
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authorizationError, setAuthorizationError] = useState<string | null>(null);
  const [canJoinGame, setCanJoinGame] = useState(false);
  const [isJoiningGame, setIsJoiningGame] = useState(false);

  // Helper function to check if an address is empty/default

  // Initialize figures array from smart contract data
  const [figures, setFigures] = useState<Figure[]>([]);

  // Figure selection state
  const [myLineup, setMyLineup] = useState<Figure[]>([]);
  const [opponentLineup, setOpponentLineup] = useState<Figure[]>([]);
  const [isSettingLineup, setIsSettingLineup] = useState(false);

  // Animation trigger - track which figure should animate
  const [animatingFigure, setAnimatingFigure] = useState<string | null>(null);
  const [jumpDirection, setJumpDirection] = useState<'Jump Forward' | 'Jump Left' | 'Jump Right'>('Jump Forward');

  // Attack system
  const [attackingFigures, setAttackingFigures] = useState<string[]>([]);
  const [attackPositions, setAttackPositions] = useState<{ [key: string]: { x: number, y: number } }>({});
  const [scaledFigures, setScaledFigures] = useState<string[]>([]);
  const [attackPhase, setAttackPhase] = useState<'prepare' | 'attack' | null>(null);
  const [dyingFigures, setDyingFigures] = useState<string[]>([]);
  const [winningFigure, setWinningFigure] = useState<string | null>(null);

  // Movement system
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [availableMoves, setAvailableMoves] = useState<{ row: number, col: number, direction: string }[]>([]);

  // Weapon selection popup for ties
  const [showWeaponPopup, setShowWeaponPopup] = useState(false);
  const [pendingAttack, setPendingAttack] = useState<{ attacker: Figure, target: Figure } | null>(null);

  // Generate random lineup (4 stones, 4 paper, 4 scissors, 1 flag, 1 trap)
  const generateRandomLineup = useCallback(() => {
    // Safety check
    if (!gameState || !publicKey) {
      console.log('Missing gameState or publicKey, returning empty lineup');
      return [];
    }

    const lineup: Figure[] = [];
    const pieces = [
      ...Array(4).fill(Weapon.Stone),
      ...Array(4).fill(Weapon.Paper),
      ...Array(4).fill(Weapon.Scissors),
      Weapon.Flag,
      Weapon.Trap
    ];

    console.log('=== LINEUP GENERATION DEBUG ===');
    console.log('isPlayer0:', isPlayer0);
    console.log('isPlayer1:', isPlayer1);
    console.log('Game State P0:', gameState?.p0?.toString());
    console.log('Game State P1:', gameState?.p1?.toString());
    console.log('My Address:', publicKey?.toString());
    console.log('P0 Match:', gameState?.p0?.toString() === publicKey?.toString());
    console.log('P1 Match:', gameState?.p1?.toString() === publicKey?.toString());
    console.log('Generated pieces:', pieces);
    console.log('Piece counts:', {
      stones: pieces.filter(p => p === Weapon.Stone).length,
      paper: pieces.filter(p => p === Weapon.Paper).length,
      scissors: pieces.filter(p => p === Weapon.Scissors).length,
      flags: pieces.filter(p => p === Weapon.Flag).length,
      traps: pieces.filter(p => p === Weapon.Trap).length
    });

    // Shuffle the pieces
    const shuffledPieces = pieces.sort(() => Math.random() - 0.5);

    // Get spawn cells for the current player (always bottom 2 rows for YOU, regardless of P0/P1)
    const spawnCells = Array.from({ length: WIDTH * 2 }, (_, i) => ({ row: Math.floor(i / HEIGHT) + HEIGHT - 2, col: i % WIDTH }));

    console.log('Spawn cells for YOU (always bottom rows 5-6):', spawnCells);

    // Shuffle spawn cells
    const shuffledCells = spawnCells.sort(() => Math.random() - 0.5);

    // Create figures
    shuffledPieces.forEach((weapon, index) => {
      if (index < shuffledCells.length) {
        const cell = shuffledCells[index];
        if (cell) {
          const isTrapPiece = weapon === Weapon.Trap;
          lineup.push({
            id: `lineup-${index}`,
            row: cell.row,
            col: cell.col,
            weapon: isTrapPiece ? undefined : weapon, // Don't set weapon for trap
            isMyFigure: true,
            isAlive: true,
            isTrap: isTrapPiece // Mark as trap piece
          });
        }
      }
    });

    console.log('Generated lineup:', lineup);
    console.log('Player type:', isPlayer0 ? 'Player 0' : 'Player 1', '- YOUR pieces always in bottom rows 4-5');
    console.log('Lineup positions:', lineup.map(f => `Row ${f.row}, Col ${f.col}`));
    return lineup;
  }, [isPlayer0, isPlayer1, gameState, publicKey]);

  // Generate opponent's lineup from game state (without weapons)
  const generateOpponentLineup = useCallback(() => {
    if (!gameState || !publicKey) {
      console.log('generateOpponentLineup: Missing gameState or publicKey');
      return [];
    }

    console.log('=== OPPONENT LINEUP DEBUG ===');
    console.log('isPlayer0:', isPlayer0);
    console.log('isPlayer1:', isPlayer1);
    console.log('Current player:', isPlayer0 ? 'Player 0' : 'Player 1');
    console.log('Owner.P0:', Owner.P0);
    console.log('Owner.P1:', Owner.P1);
    console.log('gameState.owners:', gameState.owners);
    console.log('gameState.pieces:', gameState.pieces);

    const opponentLineup: Figure[] = [];
    const opponentOwner = isPlayer0 ? Owner.P1 : Owner.P0;

    console.log('Looking for opponent owner:', opponentOwner);

    // Find all cells owned by the opponent
    for (let i = 0; i < gameState.owners.length; i++) {
      if (gameState.owners[i] === opponentOwner) {
        const row = Math.floor(i / HEIGHT);
        const col = i % WIDTH;

        console.log(`Found opponent piece at index ${i}, row ${row}, col ${col}`);

        // Only show pieces in opponent's spawn area
        // OPPONENT FIGURES ALWAYS ON TOP (rows 0-1) regardless of player
        const isOpponentSpawnArea = row <= 1;

        console.log(`Is opponent spawn area? ${isOpponentSpawnArea} (isPlayer0: ${isPlayer0}, row: ${row})`);

        if (isOpponentSpawnArea) {
          opponentLineup.push({
            id: `opponent-${i}`,
            row,
            col,
            weapon: undefined, // No weapon shown for opponent
            isMyFigure: false, // Use Front state machine
            isAlive: true
          });
        }
      }
    }

    console.log('Opponent lineup (no weapons):', opponentLineup);

    // If no opponent pieces found but we're in lineup phase, create placeholder pieces
    if (opponentLineup.length === 0) {
      console.log('Creating placeholder opponent pieces for lineup planning');

      // Create the standard lineup composition
      const placeholderPieces = [
        ...Array(4).fill(Weapon.Stone),
        ...Array(4).fill(Weapon.Paper),
        ...Array(4).fill(Weapon.Scissors),
        Weapon.Flag,
        Weapon.Trap
      ];

      // Get opponent's spawn area 
      // OPPONENT FIGURES ALWAYS ON TOP (rows 0-1) regardless of player
      const opponentSpawnCells = Array.from({ length: WIDTH * 2 }, (_, i) => ({ row: Math.floor(i / HEIGHT), col: i % HEIGHT }));

      console.log('Opponent spawn area calculation:');
      console.log('isPlayer0:', isPlayer0);
      console.log('isPlayer1:', isPlayer1);
      console.log('Expected opponent area: ALWAYS rows 0-1 (top)');
      console.log('Opponent spawn cells:', opponentSpawnCells.map(c => `Row ${c.row}, Col ${c.col}`));

      // Shuffle spawn cells for random placement
      const shuffledCells = opponentSpawnCells.sort(() => Math.random() - 0.5);

      // Create placeholder figures
      placeholderPieces.forEach((weapon, index) => {
        if (index < shuffledCells.length) {
          const cell = shuffledCells[index];
          if (cell) {
            opponentLineup.push({
              id: `placeholder-opponent-${index}`,
              row: cell.row,
              col: cell.col,
              weapon: undefined, // No weapon shown for opponent
              isMyFigure: false, // Use Front state machine
              isAlive: true,
              isOpponentPlaceholder: true // Add flag for debugging
            });
          }
        }
      });

      console.log('Created placeholder opponent pieces:', opponentLineup.length);
      console.log('Opponent piece positions:', opponentLineup.map(f => `Row ${f.row}, Col ${f.col}, isMyFigure: ${f.isMyFigure}`));
    }

    return opponentLineup;
  }, [gameState, publicKey, isPlayer0, isPlayer1]);

  // Update opponent lineup when game state changes
  useEffect(() => {
    console.log('Opponent lineup useEffect triggered:', { isSettingLineup, gameState: !!gameState });
    if (isSettingLineup) {
      console.log('Generating opponent lineup...');
      const newOpponentLineup = generateOpponentLineup();
      console.log('Setting opponent lineup:', newOpponentLineup);
      setOpponentLineup(newOpponentLineup);
    }
  }, [gameState, isSettingLineup, generateOpponentLineup]);

  // Handle shuffling lineup
  const handleShuffleLineup = useCallback(() => {
    setMyLineup(generateRandomLineup());
    // Also shuffle opponent lineup for better planning
    const newOpponentLineup = generateOpponentLineup();
    setOpponentLineup(newOpponentLineup);
    // toast.success('Lineup shuffled!');
  }, [generateRandomLineup, generateOpponentLineup]);

  // Handle submitting lineup
  const handleSubmitLineup = useCallback(async () => {
    if (!submitCustomLineup || myLineup.length === 0) return;

    try {
      // Convert lineup to the format expected by the smart contract
      const xs = myLineup.map(f => f.col);
      // For Player 1 the board is flipped vertically in the UI; flip Y back for on-chain
      const ys = myLineup.map(f => (isPlayer1 ? (rows - 1 - f.row) : f.row));
      // For trap pieces, send Weapon.Trap; for others, use their weapon or Weapon.None
      const pieces = myLineup.map(f => f.isTrap ? Weapon.Trap : (f.weapon || Weapon.None));

      console.log('Submitting lineup:', { xs, ys, pieces, isPlayer0, isPlayer1 });
      console.log('Lineup:', myLineup);
      console.log('Pieces with traps:', pieces.map((p, i) => `${i}: ${WEAPON_NAMES[p]}`));

      await submitCustomLineup(xs, ys, pieces);
      await refreshGameState();

      setIsSettingLineup(false);
      toast.success('Lineup submitted successfully!');
    } catch (err) {
      console.error('Failed to submit lineup:', err);
      toast.error(`Failed to submit lineup: ${err}`);
    }
  }, [submitCustomLineup, myLineup, isPlayer0, isPlayer1]);

  // Handle joining the game
  const handleJoinGame = useCallback(async () => {
    if (!joinGame || isJoiningGame) return;

    // Check if user is already in the game
    if (gameState && (isPlayer0 || isPlayer1)) {
      console.log('User is already in this game');
      toast.info('You are already in this game', { id: 'join-game' });
      return;
    }

    setIsJoiningGame(true);
    toast.loading('Joining game...', { id: 'join-game' });

    try {
      await joinGame(gamePda);
      toast.success('Successfully joined the game!', { id: 'join-game' });
      // The useEffect will handle updating the authorization state
    } catch (err) {
      console.error('Failed to join game:', err);
      toast.error(`Failed to join game: ${err}`, { id: 'join-game' });
    } finally {
      setIsJoiningGame(false);
    }
  }, [joinGame, isJoiningGame, gamePda, gameState, isPlayer0, isPlayer1]);

  // All useEffect hooks
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    // Set initial width
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    if (gameState?.tiePending && figures.length > 0 && !pendingAttack && !isPlayerChoice()) {
      const attackerCell = gameState?.tieFrom;
      let attacker: Figure | undefined;
      if (isPlayer1) {
        attacker = figures.find(f => f.row === (HEIGHT - 1) - attackerCell.y && f.col === (WIDTH - 1) - attackerCell.x && f.isAlive);
      } else {
        attacker = figures.find(f => f.row === attackerCell.y && f.col === attackerCell.x && f.isAlive);
      }

      const targetCell = gameState?.tieTo;
      let target: Figure | undefined;
      if (isPlayer1) {
        target = figures.find(f => f.row === (HEIGHT - 1) - targetCell.y && f.col === (WIDTH - 1) - targetCell.x && f.isAlive);
      } else {
        target = figures.find(f => f.row === targetCell.y && f.col === targetCell.x && f.isAlive);
      }

      if (attacker && target) {
        attacker.weapon = gameState?.attacker as Weapon;
        setFigures(prev => prev.map(g => g.id === attacker.id ? { ...g, weapon: attacker.weapon } : g));

        target.weapon = gameState?.defender as Weapon;
        setFigures(prev => prev.map(g => g.id === target.id ? { ...g, weapon: target.weapon } : g));

        console.log("attacker: ", attacker)
        console.log("target: ", target)

        setPendingAttack({ attacker, target });
        setShowWeaponPopup(true);
      }
    }
  }, [gameState?.tiePending, figures, pendingAttack, isPlayerChoice]);

  // Check if lineup should be set
  useEffect(() => {
    if (gameState && isAuthorized) {
      console.log('Lineup check:', {
        phase: gameState.phase,
        isPlayer0,
        isPlayer1,
        isAuthorized,
        myLineupLength: myLineup.length,
        isSettingLineup
      });

      // Based on smart contract: lineup can be submitted in Created, Joined, LineupP0Set, LineupP1Set phases
      // But we show controls when it's the player's turn to submit
      const shouldSetLineup =
        (gameState.phase === 1 && isPlayer0) || // Joined phase, player 0 can submit first
        (gameState.phase === 1 && isPlayer1 && !isEmptyAddress(gameState.p0)) || // Joined phase, player 1 can submit if P0 exists
        (gameState.phase === 2 && isPlayer1) || // LineupP0Set phase, player 1 can submit
        (gameState.phase === 3 && isPlayer0); // LineupP1Set phase, player 0 can submit

      console.log('Should set lineup:', shouldSetLineup);

      if (shouldSetLineup && myLineup.length === 0) {
        console.log('Setting lineup mode to true and generating lineup');
        setIsSettingLineup(true);
        setMyLineup(generateRandomLineup());
        // Also generate opponent lineup immediately
        const initialOpponentLineup = generateOpponentLineup();
        setOpponentLineup(initialOpponentLineup);
        console.log('Initial opponent lineup generated:', initialOpponentLineup.length);
      } else if (gameState.phase >= 4) { // Active phase or later - lineup already submitted
        console.log('Lineup already submitted, hiding controls');
        setIsSettingLineup(false);
      }
    }
  }, [gameState, isAuthorized, isPlayer0, isPlayer1, myLineup.length, generateRandomLineup, generateOpponentLineup, isSettingLineup]);

  // Update figures when game state changes (render from on-chain lineup)
  useEffect(() => {
    if (gameState) {
      let newFigures: Figure[] = [];
      let figureId = 0;

      // Convert smart contract data to figures
      for (let i = 0; i < HEIGHT * WIDTH; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const owner = gameState.owners[i];
        const piece = gameState.pieces[i];

        // Determine if this is the user's figure (Owner.None=0, P0=1, P1=2)
        const isMyFigure = (isPlayer0 && owner === Owner.P0) || (isPlayer1 && owner === Owner.P1);

        // Only create figure if it's owned by someone
        if (owner !== 0) { // 0 = None in Owner enum
          const isTrapPiece = (piece as number) === Weapon.Trap;
          newFigures.push({
            id: `figure-${figureId++}`,
            row,
            col,
            // Hide weapon for trap pieces (trap has its own animation), show otherwise
            weapon: isTrapPiece ? undefined : (piece as Weapon),
            isMyFigure,
            isAlive: true,
            isTrap: isTrapPiece
          });
        }
      }

      // During lineup setting, add opponent's pieces (without weapons)
      if (isSettingLineup) {
        console.log('Adding opponent pieces during lineup setting...');
        console.log('Opponent lineup from state:', opponentLineup);
        console.log('Opponent lineup length:', opponentLineup.length);
        console.log('Adding to newFigures, current length:', newFigures.length);
        newFigures.push(...opponentLineup);
        console.log('After adding opponent pieces, newFigures length:', newFigures.length);
      }

      if (isPlayer1) {
        const mirroredData = newFigures.map(figure => ({
          ...figure,
          row: (HEIGHT - 1) - figure.row,
          col: (WIDTH - 1) - figure.col,
        }));
        setFigures(mirroredData);
      } else {
        setFigures(newFigures);
      }
    }
  }, [gameState, isPlayer0, isPlayer1, isSettingLineup, opponentLineup]);

  // Debug when opponentLineup changes
  useEffect(() => {
    console.log('opponentLineup state changed:', opponentLineup);
  }, [opponentLineup]);

  // Debug when isSettingLineup changes
  useEffect(() => {
    console.log('isSettingLineup changed to:', isSettingLineup);
  }, [isSettingLineup]);

  // Check authorization and join eligibility when game state loads
  useEffect(() => {
    if (gameState && publicKey) {
      console.log('Game state data:', {
        p0: gameState.p0,
        p1: gameState.p1,
        p0Type: typeof gameState.p0,
        p1Type: typeof gameState.p1,
        userAddress: publicKey.toString()
      });

      const userAddress = publicKey.toString();
      const p0Address = String(gameState.p0);
      const p1Address = String(gameState.p1);
      const isPlayer0 = p0Address === userAddress && !isEmptyAddress(p0Address);
      const isPlayer1 = p1Address === userAddress && !isEmptyAddress(p1Address);

      console.log('Authorization check:', {
        userAddress,
        p0Address,
        p1Address,
        isPlayer0,
        isPlayer1,
        isEmptyP0: isEmptyAddress(p0Address),
        isEmptyP1: isEmptyAddress(p1Address)
      });

      // Check if user is already a player
      if (isPlayer0 || isPlayer1) {
        setIsAuthorized(true);
        setCanJoinGame(false);
        setAuthorizationError(null);
        toast.success(`Welcome! You are ${isPlayer0 ? 'Player 0' : 'Player 1'}`);
      } else {
        // Check if game can be joined (has empty slot)
        const hasEmptySlot = isEmptyAddress(p0Address) || isEmptyAddress(p1Address);

        if (hasEmptySlot) {
          setIsAuthorized(false);
          setCanJoinGame(true);
          setAuthorizationError(null);
        } else {
          setIsAuthorized(false);
          setCanJoinGame(false);
          setAuthorizationError('You are not authorized to play this game. Only the game players can access it.');
          toast.error('Not authorized to play this game');
        }
      }
    }
  }, [gameState, publicKey]);

  // Validate game ID
  if (!gamePda) {
    return (
      <main style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        background: 'linear-gradient(135deg, #0e1419 0%, #11171c 100%)'
      }}>
        <div style={{
          textAlign: 'center',
          background: '#0e1419',
          border: '1px solid #2b3a44',
          borderRadius: '12px',
          padding: '48px',
          maxWidth: '400px',
          width: '90%'
        }}>
          <div style={{ fontSize: 28, color: '#ff6b6b', marginBottom: 16, fontWeight: 'bold' }}>
            Invalid Game ID
          </div>
          <div style={{ color: '#c5c6c7', marginBottom: 32, fontSize: 16, lineHeight: 1.5 }}>
            The game ID &quot;{id}&quot; is not valid. Please check the URL and try again.
          </div>
          <div style={{ color: '#8a9ba8', fontSize: 14 }}>
            Game ID must be a positive number
          </div>
        </div>
      </main>
    );
  }

  if (connected && !isInitialized) {
    return (
      <main style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0e1419 0%, #11171c 100%)'
      }}>
        <div style={{ textAlign: 'center', color: '#c5c6c7' }}>
          <div style={{ fontSize: 24, color: '#66fcf1', marginBottom: 16 }}>
            {gameError ? 'Session Error' : 'Waiting for signature...'}
          </div>
          <div style={{ fontSize: 14 }}>
            {gameError || 'Please confirm the message in your wallet'}
          </div>
        </div>
      </main>
    );
  }

  // Show "waiting for opponent" screen when you're in the game and the other slot is empty
  if (
    isAuthorized &&
    gameState &&
    (
      (isPlayer0 && isEmptyAddress(String(gameState.p1 || ''))) ||
      (isPlayer1 && isEmptyAddress(String(gameState.p0 || '')))
    ) &&
    (gameState.phase === 0 || gameState.phase === 1)
  ) {
    const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
    return (
      <main style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        background: 'linear-gradient(135deg, #0e1419 0%, #11171c 100%)'
      }}>
        <div style={{
          textAlign: 'center',
          background: '#0e1419',
          border: '1px solid #2b3a44',
          borderRadius: '12px',
          padding: '48px',
          maxWidth: '560px',
          width: '90%'
        }}>
          <div style={{ fontSize: 28, color: '#66fcf1', marginBottom: 16, fontWeight: 'bold' }}>
            Waiting for the opponent to join
          </div>
          <div style={{ color: '#c5c6c7', marginBottom: 24, fontSize: 16, lineHeight: 1.5 }}>
            Share the link with your friend to invite them to this game.
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <input
              readOnly
              value={shareUrl}
              style={{
                flex: 1,
                background: '#0b1116',
                color: '#c5c6c7',
                border: '1px solid #2b3a44',
                borderRadius: 8,
                padding: '12px',
                fontSize: 14
              }}
            />
            <button
              onClick={() => {
                if (shareUrl) {
                  navigator.clipboard.writeText(shareUrl);
                  toast.success('Link copied to clipboard');
                }
              }}
              style={{
                background: '#66fcf1',
                color: '#0e1419',
                border: 'none',
                padding: '12px 16px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 'bold'
              }}
            >
              Copy Link
            </button>
          </div>
          <div style={{ color: '#8a9ba8', fontSize: 12 }}>
            Game PDA: {gamePda.slice(0, 8)}...
          </div>
        </div>
      </main>
    );
  }

  // Show loading state only on initial load (when we don't have game state yet)
  if (gameLoading && !gameState) {
    return (
      <main style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, color: '#66fcf1', marginBottom: 16 }}>Loading game...</div>
          <div style={{ color: '#c5c6c7' }}>Fetching game state from blockchain</div>
        </div>
      </main>
    );
  }

  // Show error state only if we don't have game state (critical error on initial load)
  if (gameError && !gameState) {
    return (
      <main style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, color: '#ff6b6b', marginBottom: 16 }}>Error loading game</div>
          <div style={{ color: '#c5c6c7', marginBottom: 16 }}>{gameError}</div>
          <button
            onClick={refreshGameState}
            style={{
              background: '#66fcf1',
              color: '#0e1419',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: 16
            }}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  // Show join game screen
  if (canJoinGame) {
    return (
      <main style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        background: 'linear-gradient(135deg, #0e1419 0%, #11171c 100%)'
      }}>
        <div style={{
          textAlign: 'center',
          background: '#0e1419',
          border: '1px solid #2b3a44',
          borderRadius: '12px',
          padding: '48px',
          maxWidth: '500px',
          width: '90%'
        }}>
          <div style={{ fontSize: 28, color: '#66fcf1', marginBottom: 16, fontWeight: 'bold' }}>
            Join Game {gamePda.slice(0, 8)}...
          </div>
          <div style={{ color: '#c5c6c7', marginBottom: 24, fontSize: 16, lineHeight: 1.5 }}>
            This game is waiting for a second player. Would you like to join?
          </div>

          <div style={{ marginBottom: 32, fontSize: 14, color: '#8a9ba8' }}>
            <div>Game Phase: {gameState?.phase}</div>
            <div>Current Players: {(!isEmptyAddress(String(gameState?.p0 || ''))) ? '1' : '0'} / 2</div>
            {gameState?.p0 && !isEmptyAddress(String(gameState.p0)) && (
              <div>Player 0: {String(gameState.p0).slice(0, 8)}...</div>
            )}
          </div>

          <button
            onClick={handleJoinGame}
            disabled={isJoiningGame}
            style={{
              background: isJoiningGame ? '#2b3a44' : '#66fcf1',
              color: isJoiningGame ? '#8a9ba8' : '#0e1419',
              border: 'none',
              padding: '16px 32px',
              borderRadius: '8px',
              cursor: isJoiningGame ? 'not-allowed' : 'pointer',
              fontSize: 18,
              fontWeight: 'bold',
              transition: 'all 0.2s ease',
              marginBottom: 16,
              width: '100%'
            }}
          >
            {isJoiningGame ? 'Joining...' : 'Join Game'}
          </button>

          <div style={{ color: '#8a9ba8', fontSize: 12 }}>
            You will become Player {(!isEmptyAddress(String(gameState?.p0 || ''))) ? '1' : '0'}
          </div>
        </div>
      </main>
    );
  }

  // Show authorization error
  if (authorizationError) {
    return (
      <main style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, color: '#ff6b6b', marginBottom: 16 }}>Access Denied</div>
          <div style={{ color: '#c5c6c7', marginBottom: 16 }}>{authorizationError}</div>
          <div style={{ color: '#c5c6c7', fontSize: 14 }}>
            Game Players: {gameState?.p0 ? `${String(gameState.p0).slice(0, 8)}...` : 'Unknown'} and {gameState?.p1 ? `${String(gameState.p1).slice(0, 8)}...` : 'Unknown'}
          </div>
        </div>
      </main>
    );
  }

  // Show game over screens
  if (gameState?.phase === 5 && gameState?.winner) {
    const isWinner =
      (isPlayer0 && gameState.p0.toString() === gameState.winner.toString()) ||
      (isPlayer1 && gameState.p1.toString() === gameState.winner.toString());

    return (
      <main style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        background: isWinner
          ? 'linear-gradient(135deg, #0a1f0a 0%, #0e2e0e 100%)'
          : 'linear-gradient(135deg, #1f0a0a 0%, #2e0e0e 100%)',
      }}>
        <div style={{
          textAlign: 'center',
          background: '#0e1419',
          border: `1px solid ${isWinner ? '#4caf50' : '#f44336'}`,
          borderRadius: '16px',
          padding: '64px 48px',
          maxWidth: '480px',
          width: '90%',
          boxShadow: isWinner
            ? '0 0 48px rgba(76, 175, 80, 0.2)'
            : '0 0 48px rgba(244, 67, 54, 0.2)',
        }}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>
            {isWinner ? '🏆' : '💀'}
          </div>

          <div style={{
            fontSize: 36,
            fontWeight: 'bold',
            marginBottom: 12,
            color: isWinner ? '#4caf50' : '#f44336',
          }}>
            {isWinner ? 'Victory!' : 'Defeat'}
          </div>

          <div style={{
            fontSize: 16,
            color: '#c5c6c7',
            marginBottom: 32,
            lineHeight: 1.6,
          }}>
            {isWinner
              ? 'Congratulations! You have defeated your opponent.'
              : 'Better luck next time. Your opponent was stronger this round.'}
          </div>

          <div style={{
            background: '#0b1116',
            border: '1px solid #2b3a44',
            borderRadius: 8,
            padding: '16px',
            marginBottom: 32,
            fontSize: 14,
            color: '#8a9ba8',
          }}>
            <div>Winner: {gameState.winner.toString().slice(0, 8)}...</div>
            <div style={{ marginTop: 4 }}>
              Final score: {gameState.live0} vs {gameState.live1}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexDirection: 'column' }}>
            <button
              onClick={() => window.location.href = '/'}
              style={{
                background: isWinner ? '#4caf50' : '#f44336',
                color: '#fff',
                border: 'none',
                padding: '14px 32px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 'bold',
              }}
            >
              Back to Lobby
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Show wallet connection prompt
  if (!connected) {
    return (
      <main style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        background: 'linear-gradient(135deg, #0e1419 0%, #11171c 100%)'
      }}>
        <div style={{
          textAlign: 'center',
          background: '#0e1419',
          border: '1px solid #2b3a44',
          borderRadius: '12px',
          padding: '48px',
          maxWidth: '400px',
          width: '90%'
        }}>
          <div style={{ fontSize: 28, color: '#66fcf1', marginBottom: 16, fontWeight: 'bold' }}>
            Connect Wallet
          </div>
          <div style={{ color: '#c5c6c7', marginBottom: 32, fontSize: 16, lineHeight: 1.5 }}>
            Please connect your wallet to access this game
          </div>
          <div style={{ marginBottom: 24 }}>
            <WalletMultiButton
              style={{
                background: '#66fcf1',
                color: '#0e1419',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            />
          </div>
          <div style={{ color: '#8a9ba8', fontSize: 14 }}>
            Game PDA: {gamePda.slice(0, 8)}...
          </div>
        </div>
      </main>
    );
  }

  // Calculate responsive cell dimensions for positioning
  // Use actual board dimensions if available, otherwise fallback to calculated values
  const actualBoardWidth = boardRef?.clientWidth || (windowWidth > 0 ? Math.min(840, windowWidth * 0.9) : 840);
  const actualBoardHeight = boardRef?.clientHeight || (actualBoardWidth * rows) / cols;
  const actualCellWidth = actualBoardWidth / cols;
  const actualCellHeight = actualBoardHeight / rows;

  // Calculate responsive figure size based on actual cell dimensions
  //   console.log('actualCellWidth:', actualCellWidth, 'actualCellHeight:', actualCellHeight);
  const cellSize = Math.min(actualCellWidth, actualCellHeight);

  // Use a hybrid approach: minimum size for small fields, scaled size for large fields
  const figureSize = cellSize * 1.5;
  const figureScale = 1.0;
  //   console.log('figureSize:', figureSize, 'figureScale:', figureScale, 'cellSize:', cellSize);

  // Handle weapon selection from popup
  const handleWeaponSelection = (selectedWeapon: Weapon) => {
    if (!pendingAttack) return;

    const { attacker, target } = pendingAttack;

    (async () => {
      try {
        await chooseWeapon(selectedWeapon as Choice);
        await refreshGameState();

        if (!gameStateRef.current?.tiePending) {
          const updatedAttacker = { ...attacker, weapon: gameStateRef.current?.attacker as Weapon };
          setFigures(prev => prev.map(g => g.id === updatedAttacker.id ? { ...g, weapon: updatedAttacker.weapon } : g));

          const updatedTarget = { ...target, weapon: gameStateRef.current?.defender as Weapon };
          setFigures(prev => prev.map(g => g.id === updatedTarget.id ? { ...g, weapon: updatedTarget.weapon } : g));

          console.log("updatedAttacker:", updatedAttacker)
          console.log("updatedTarget: ", updatedTarget)
          console.log("gameStateRef.current?.outcome: ", gameStateRef.current?.outcome)

          proceedWithAttack(updatedAttacker, updatedTarget);
        }
      } catch (err) {
        console.error('Failed to choose weapon:', err);
      } finally {
        // Close popup and continue with attack
        setShowWeaponPopup(false);
        setPendingAttack(null);
      }
    })();

  };

  const getAvailableMoves = (figure: Figure) => {
    const moves: { row: number, col: number, direction: string }[] = [];
    const directions = [
      { row: -1, col: 0, direction: 'up' },
      { row: 1, col: 0, direction: 'down' },
      { row: 0, col: -1, direction: 'left' },
      { row: 0, col: 1, direction: 'right' }
    ];

    directions.forEach(({ row: deltaRow, col: deltaCol, direction }) => {
      const newRow = figure.row + deltaRow;
      const newCol = figure.col + deltaCol;

      // Check if move is within bounds
      if (newRow >= 0 && newRow < rows && newCol >= 0 && newCol < cols) {
        // Check if target cell is empty
        const targetFigure = figures.find(f => f.row === newRow && f.col === newCol && f.isAlive);
        if (!targetFigure) {
          moves.push({ row: newRow, col: newCol, direction });
        }
      }
    });

    return moves;
  };

  const handleCellClick = (cellKey: number, figure: Figure | null) => {
    console.log('Cell clicked:', cellKey, 'figure:', figure);

    // If clicking on a selected figure, deselect it
    if (selectedFigure && figure && figure.id === selectedFigure.id) {
      setSelectedFigure(null);
      setAvailableMoves([]);
      return;
    }

    // If clicking on one of my figures, select it and show available moves
    // BUT: Don't allow selecting trap pieces or when it's not my turn
    if (figure && figure.isMyFigure) {
      if (!isMyTurn) {
        toast.info('Wait for your turn');
        return;
      }
      // Prevent selecting trap pieces
      if (figure.isTrap) {
        console.log('Cannot select trap piece - traps are not movable');
        toast.info('Traps cannot be moved');
        return;
      }

      const moves = getAvailableMoves(figure);
      setSelectedFigure(figure);
      setAvailableMoves(moves);
      console.log('Selected figure:', figure.id, 'Available moves:', moves);
      return;
    }

    // If clicking on an opponent figure and I have a selected figure, check if it's adjacent
    if (selectedFigure && figure && !figure.isMyFigure) {
      if (!isMyTurn) {
        toast.info('Wait for your turn');
        return;
      }
      const cellRow = Math.floor(cellKey / cols);
      const cellCol = cellKey % cols;
      const isAdjacent = Math.abs(selectedFigure.row - cellRow) + Math.abs(selectedFigure.col - cellCol) === 1;

      if (isAdjacent) {
        console.log('Attacking opponent figure:', figure.id);
        attackFigure(selectedFigure, figure);
        setSelectedFigure(null);
        setAvailableMoves([]);
        return;
      }
    }

    // If clicking on an available move cell, submit on-chain move
    if (selectedFigure && !figure) {
      if (!isMyTurn) {
        toast.info('Wait for your turn');
        return;
      }
      const move = availableMoves.find(move => {
        const cellRow = Math.floor(cellKey / cols);
        const cellCol = cellKey % cols;
        return move.row === cellRow && move.col === cellCol;
      });

      if (move) {
        console.log('Submitting on-chain move to:', move);
        const fromX = isPlayer1 ? (cols - 1 - selectedFigure.col) : selectedFigure.col;
        const fromY = isPlayer1 ? (rows - 1 - selectedFigure.row) : selectedFigure.row; 
        const toX = isPlayer1 ? (cols - 1 - move.col) : move.col;
        const toY = isPlayer1 ? (rows - 1 - move.row) : move.row;
        const toastId = `move-${selectedFigure.id}-${toX}-${toY}`;
        toast.loading('Submitting move...', { id: toastId });
        (async () => {
          try {
            await movePiece(fromX, fromY, toX, toY);
            await refreshGameState();
            toast.success('Move submitted', { id: toastId });
          } catch (err) {
            console.error('Failed to submit move:', err);
            toast.error(`Failed to submit move: ${err}`, { id: toastId });
          } finally {
            setSelectedFigure(null);
            setAvailableMoves([]);
          }
        })();
        return;
      }
    }

    // If clicking elsewhere, deselect
    setSelectedFigure(null);
    setAvailableMoves([]);
  };

  const moveFigure = (figure: Figure, newRow: number, newCol: number) => {
    // Determine jump direction based on movement
    const rowDiff = newRow - figure.row;
    const colDiff = newCol - figure.col;

    let jumpDirection: 'Jump Forward' | 'Jump Left' | 'Jump Right' = 'Jump Forward';
    if (colDiff < 0) {
      jumpDirection = 'Jump Left';  // Moving left
    } else if (colDiff > 0) {
      jumpDirection = 'Jump Right'; // Moving right
    }
    // For up/down movement (rowDiff !== 0), use 'Jump Forward'

    // Start animation on the figure (using figure ID)
    setAnimatingFigure(figure.id);
    setJumpDirection(jumpDirection);

    // Calculate positions
    const oldX = (figure.col * actualCellWidth) + (actualCellWidth / 2);
    const oldY = (figure.row * actualCellHeight) + (actualCellHeight / 2) - (actualCellHeight * 0.25);
    const newX = (newCol * actualCellWidth) + (actualCellWidth / 2);
    const newY = (newRow * actualCellHeight) + (actualCellHeight / 2) - (actualCellHeight * 0.25);

    // Mark figure as moving and set initial animation position
    setFigures(prevFigures =>
      prevFigures.map(f =>
        f.id === figure.id
          ? {
            ...f,
            row: newRow,
            col: newCol,
            isMoving: true,
            oldRow: figure.row,
            oldCol: figure.col,
            animX: oldX,
            animY: oldY
          }
          : f
      )
    );

    // Start position animation after 200ms delay
    setTimeout(() => {
      const startTime = Date.now();
      // Different durations based on jump direction
      const duration = (jumpDirection === 'Jump Left' || jumpDirection === 'Jump Right') ? 300 : 500;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function for smooth animation
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        const currentX = oldX + (newX - oldX) * easeProgress;
        const currentY = oldY + (newY - oldY) * easeProgress;

        setFigures(prevFigures =>
          prevFigures.map(f =>
            f.id === figure.id
              ? { ...f, animX: currentX, animY: currentY }
              : f
          )
        );

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Animation complete
          setFigures(prevFigures =>
            prevFigures.map(f =>
              f.id === figure.id
                ? {
                  ...f,
                  isMoving: false,
                  oldRow: undefined,
                  oldCol: undefined,
                  animX: undefined,
                  animY: undefined
                }
                : f
            )
          );
          setAnimatingFigure(null);
        }
      };

      requestAnimationFrame(animate);
    }, 200); // 200ms delay before position animation starts
  };

  const attackFigure = (attacker: Figure, target: Figure) => {
    console.log('Attack initiated:', attacker.id, 'attacks', target.id);

    const fromX = isPlayer1 ? (cols - 1 - attacker.col) : attacker.col;
    const fromY = isPlayer1 ? (rows - 1 - attacker.row) : attacker.row; 
    const toX = isPlayer1 ? (cols - 1 - target.col) : target.col;
    const toY = isPlayer1 ? (rows - 1 - target.row) : target.row;

    const toastId = `attack-${attacker.id}-${toX}-${toY}`;
    toast.loading('Submitting attack...', { id: toastId });
    (async () => {
      try {
        await movePiece(fromX, fromY, toX, toY);
        await refreshGameState();
        toast.success('Attack submitted', { id: toastId });

        console.log("gameStateRef.current?.attacker: ", gameStateRef.current?.attacker)
        console.log("gameStateRef.current?.defender: ", gameStateRef.current?.defender)
        console.log("attacker: ", attacker)
        console.log("target: ", target)
        console.log("gameStateRef.current?.tiePending: ", gameStateRef.current?.tiePending)

        // Check for tie - if both weapons are the same, show weapon selection popup
        if (gameStateRef.current?.tiePending) {
          console.log('Tie detected! Showing weapon selection popup');
          setPendingAttack({ attacker, target });
          setShowWeaponPopup(true);
          return;
        }

        // No tie, proceed with normal attack logic
        proceedWithAttack(attacker, target);
      } catch (err) {
        console.error('Failed to submit attack:', err);
        toast.error(`Failed to submit attack: ${err}`, { id: toastId });
      } finally {
        setSelectedFigure(null);
        setAvailableMoves([]);
      }
    })();
  };

  const proceedWithAttack = (attacker: Figure, target: Figure) => {
    console.log('Proceeding with attack:', attacker.id, 'attacks', target.id);

    let winner!: Figure;
    let loser!: Figure;

    attacker.weapon = gameStateRef.current?.attacker as Weapon;
    target.weapon = gameStateRef.current?.defender as Weapon;

    console.log("attacker: ", attacker)
    console.log("target: ", target)

    console.log("gameStateRef.current?.outcome: ", gameStateRef.current?.outcome)

    if (gameStateRef.current?.outcome === 1) {
      winner = attacker;
      loser = target;
    } else if (gameStateRef.current?.outcome === -1) {
      winner = target;
      loser = attacker;
    }

    console.log("winner: ", winner)
    console.log("loser: ", loser)

    // Calculate attack positions (both figures move to center between them)
    const attackerX = (attacker.col * actualCellWidth) + (actualCellWidth / 2);
    const attackerY = (attacker.row * actualCellHeight) + (actualCellHeight / 2) - (actualCellHeight * 0.25);
    const targetX = (target.col * actualCellWidth) + (actualCellWidth / 2);
    const targetY = (target.row * actualCellHeight) + (actualCellHeight / 2) - (actualCellHeight * 0.25);

    // Calculate center position between attacker and target
    const centerX = (attackerX + targetX) / 2;
    const centerY = (attackerY + targetY) / 2;

    // Add some distance between figures
    // const attackerFinalX = centerX - DISTANCE_BETWEEN_FIGURES_DURING_ATTACK;
    // const targetFinalX = centerX + DISTANCE_BETWEEN_FIGURES_DURING_ATTACK;
    const attackerIsLeft = attacker.col <= target.col;
    const attackerFinalX = attackerIsLeft
      ? centerX - DISTANCE_BETWEEN_FIGURES_DURING_ATTACK
      : centerX + DISTANCE_BETWEEN_FIGURES_DURING_ATTACK;
    const targetFinalX = attackerIsLeft
      ? centerX + DISTANCE_BETWEEN_FIGURES_DURING_ATTACK
      : centerX - DISTANCE_BETWEEN_FIGURES_DURING_ATTACK;

    // Set both figures as attacking
    setAttackingFigures([attacker.id, target.id]);

    // Set winner and loser for animations
    setWinningFigure(winner.id);

    // Don't scale during "Attack Prepare" phase, but keep movement animation

    // Start with "Attack Prepare" phase
    setAttackPhase('prepare');
    // Move to attack positions 100ms after prepare
    setTimeout(() => {
      setAttackPositions({
        [attacker.id]: { x: attackerFinalX, y: centerY },
        [target.id]: { x: targetFinalX, y: centerY }
      });
    }, 100);

    //TODO: if opponent wins, winner.weapon = 0. So I have to fetch it somehow.
    console.log('Winner weapon:', WEAPON_NAMES[winner.weapon || Weapon.None]);
    const attackTimeMs = (winner.weapon || Weapon.None) === Weapon.Stone ? 383 : (winner.weapon || Weapon.None) === Weapon.Paper ? 500 : (winner.weapon || Weapon.None) === Weapon.Scissors ? 966 : 400;

    // After 400ms, switch to "Attack" phase and scale figures
    setTimeout(() => {
      setAttackPhase('attack');
      setScaledFigures([attacker.id, target.id]);

      setTimeout(() => {
        setDyingFigures([loser.id]);

      }, attackTimeMs + 100);
    }, 400);

    // Reset attack state and resolve combat after total animation duration
    setTimeout(() => {
      setAttackingFigures([]);
      setAttackPositions({});
      setScaledFigures([]);
      setAttackPhase(null);
      setWinningFigure(null);

      // Resolve combat with predetermined winner
      resolveCombatWithWinner(attacker, target, winner);

      setTimeout(() => {
        setDyingFigures([]);
      }, 400);
    }, 400 + 200 + attackTimeMs + 100); // keep ~200ms window after death starts
  };

  const resolveCombatWithWinner = (attacker: Figure, target: Figure, winner: Figure) => {
    console.log('Combat resolution with predetermined winner:', { attacker: attacker.id, target: target.id, winner: winner.id });

    if (winner.id === attacker.id) {
      // Attacker wins: attacker moves to target's cell with animation, target disappears
      console.log('Moving attacker to:', target.row, target.col);

      // Calculate positions for smooth movement
      // Use the actual attack position where the figure currently is (center between figures)
      const attackerX = (attacker.col * actualCellWidth) + (actualCellWidth / 2);
      const attackerY = (attacker.row * actualCellHeight) + (actualCellHeight / 2) - (actualCellHeight * 0.25);
      const targetX = (target.col * actualCellWidth) + (actualCellWidth / 2);
      const targetY = (target.row * actualCellHeight) + (actualCellHeight / 2) - (actualCellHeight * 0.25);

      // Calculate center position (where figures are during attack)
      const centerX = (attackerX + targetX) / 2;
      const centerY = (attackerY + targetY) / 2;

      // Current position is the attacker's attack position (center - distance)
      //const currentX = centerX - DISTANCE_BETWEEN_FIGURES_DURING_ATTACK;
      const attackerIsLeft = attacker.col <= target.col;
      const currentX = attackerIsLeft
        ? centerX - DISTANCE_BETWEEN_FIGURES_DURING_ATTACK
        : centerX + DISTANCE_BETWEEN_FIGURES_DURING_ATTACK;
      const currentY = centerY;

      // Set attacker as moving and update position immediately
      setFigures(prevFigures =>
        prevFigures.map(f => {
          if (f.id === attacker.id) {
            return {
              ...f,
              row: target.row,
              col: target.col,
              isMoving: true,
              oldRow: attacker.row,
              oldCol: attacker.col,
              animX: currentX,
              animY: currentY
            };
          }
          return f;
        })
      );
      // Delay loser removal to allow death animation to play
      setTimeout(() => {
        setFigures(prev => prev.map(g => g.id === target.id ? { ...g, isAlive: false } : g));
      }, 500);

      // Animate movement to target position
      const startTime = Date.now();
      const duration = 200; // 200ms movement animation

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function for smooth animation
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        const currentAnimX = currentX + (targetX - currentX) * easeProgress;
        const currentAnimY = currentY + (targetY - currentY) * easeProgress;

        setFigures(prevFigures =>
          prevFigures.map(f =>
            f.id === attacker.id
              ? { ...f, animX: currentAnimX, animY: currentAnimY }
              : f
          )
        );

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Animation complete
          setFigures(prevFigures =>
            prevFigures.map(f =>
              f.id === attacker.id
                ? {
                  ...f,
                  isMoving: false,
                  oldRow: undefined,
                  oldCol: undefined,
                  animX: undefined,
                  animY: undefined
                }
                : f
            )
          );
        }
      };

      requestAnimationFrame(animate);
    } else {
      // Target wins: target stays in place, attacker disappears
      // Delay loser removal to allow death animation to play
      setTimeout(() => {
        setFigures(prev => prev.map(g => g.id === attacker.id ? { ...g, isAlive: false } : g));
      }, 500);
    }
  };


  return (
    <main style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(700px, 1fr) 340px',
      gap: 24,
      padding: 24,
      minHeight: '100dvh',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <section>
        <h2 style={{ color: '#66fcf1', marginTop: 0 }}>Game #{id}</h2>
        <div
          ref={setBoardRef}
          style={{
            width: '100%',
            maxWidth: 'min(840px, 90vw)',
            aspectRatio: `${cols} / ${rows}`,
            background: 'transparent',
            border: '1px solid #2b3a44',
            borderRadius: 8,
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`
          }}
        >
          {/* Grid cells for background and click detection */}
          {cells.map((_, i) => {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const availableMove = availableMoves.find(move => move.row === row && move.col === col);
            const figure = figures.find(f => f.row === row && f.col === col && f.isAlive);
            const isSelected = selectedFigure && figure && figure.id === selectedFigure.id;

            return (
              <div
                key={i}
                style={{
                  border: '1px solid #2b3a44',
                  background: i % 2 === 0 ? '#11171c' : '#0e1419',
                  position: 'relative',
                  cursor: figure?.isTrap
                    ? 'not-allowed'
                    : (!isMyTurn && figure?.isMyFigure)
                      ? 'not-allowed'
                      : (figure?.isMyFigure || availableMove ? 'pointer' : 'default'),
                  borderColor: isSelected ? '#66fcf1' : '#2b3a44',
                  borderWidth: isSelected ? '2px' : '1px'
                }}
                onClick={() => handleCellClick(i, figure || null)}
              >
                {/* Show arrow for available moves */}
                {availableMove && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '48px',
                      height: '48px',
                      backgroundImage: `url(/arrows/${availableMove.direction}.png)`,
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                      pointerEvents: 'none',
                      zIndex: 10
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* All figures positioned absolutely */}
          {riveStatus === 'success' && (isSettingLineup ? [...myLineup, ...opponentLineup] : figures.filter(f => f.isAlive)).map((figure) => {
            // Debug logging for opponent placeholders
            if (figure.isOpponentPlaceholder) {
              console.log('Rendering opponent placeholder:', figure.id, 'at row', figure.row, 'col', figure.col, 'isMyFigure:', figure.isMyFigure);
            }
            const isAnimating = animatingFigure === figure.id;

            // Use attack position if attacking, otherwise use animation position if moving, otherwise use normal position
            const attackPos = attackPositions[figure.id];
            const x = attackPos ? attackPos.x : (figure.isMoving && figure.animX !== undefined ? figure.animX : (figure.col * actualCellWidth) + (actualCellWidth / 2));
            const y = attackPos ? attackPos.y : (figure.isMoving && figure.animY !== undefined ? figure.animY : (figure.row * actualCellHeight) + (actualCellHeight / 2) - (actualCellHeight * 0.25));

            return (
              <div
                key={figure.id}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: (winningFigure === figure.id) ? 30 : (attackingFigures.includes(figure.id) ? 20 : 5),
                  transition: attackPos ? 'left 0.3s ease-in-out, top 0.3s ease-in-out' : 'none'
                }}
              >
                <RpsFigure
                  key={`${figure.id}-${figure.isTrap ? 'trap' : 'normal'}`}
                  riveFile={riveFile as any}
                  weapon={figure.weapon}
                  trigger={
                    isAnimating ? jumpDirection :
                      attackingFigures.includes(figure.id)
                        ? (
                          attackPhase === 'prepare'
                            ? 'Attack Prepare'
                            : dyingFigures.includes(figure.id)
                              ? 'Death'
                              : winningFigure === figure.id
                                ? 'Attack'
                                : undefined
                        )
                        : undefined
                  }
                  isMyFigure={figure.isMyFigure}
                  isTrap={figure.isTrap}
                  style={{
                    width: `${figureSize}px`,
                    height: `${figureSize}px`,
                    transform: `${(isPlayer1 && !figure.isMyFigure) ? 'scaleX(-1) ' : ''}scale(${scaledFigures.includes(figure.id) ? figureScale * 2 : figureScale})`,
                    transformOrigin: 'center center',
                    transition: scaledFigures.includes(figure.id) ? 'transform 0.3s ease-in-out' : 'none'
                  }}
                />
              </div>
            );
          })}
        </div>
      </section>

      <aside style={{ display: 'grid', gap: 24 }}>
        <div style={{ minHeight: 160, background: '#0e1419', border: '1px solid #2b3a44', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ color: '#c5c6c7' }}>Game Info</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={refreshGameState}
                style={{
                  background: '#66fcf1',
                  color: '#0e1419',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: 12
                }}
              >
                Refresh
              </button>
              <WalletMultiButton
                style={{
                  background: '#2b3a44',
                  color: '#c5c6c7',
                  border: '1px solid #2b3a44',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              />
            </div>
          </div>
          <div style={{ fontSize: 14, color: '#c5c6c7' }}>
            <div>Phase: {gameState?.phase || 'Unknown'} {
              gameState?.phase === 0 ? '(Created)' :
                gameState?.phase === 1 ? '(Joined)' :
                  gameState?.phase === 2 ? '(LineupP0Set)' :
                    gameState?.phase === 3 ? '(LineupP1Set)' :
                      gameState?.phase === 4 ? '(Active)' :
                        gameState?.phase === 5 ? '(Finished)' : ''
            }</div>
            <div>Game PDA: {gamePda.slice(0, 8)}...</div>
            <div>Live Pieces: {gameState?.live0 || 0} vs {gameState?.live1 || 0}</div>
            {/*<div>Setting Lineup: {isSettingLineup ? 'Yes' : 'No'}</div>*/}
            <div>My Lineup: {(isPlayer0 ? gameState?.live0 || 0 : gameState?.live1 || 0)} pieces</div>
            <div style={{ marginTop: 8, color: '#66fcf1', fontWeight: 'bold' }}>Lineup Status</div>
            <div>My lineup submitted: {gameState?.phase && gameState.phase >= (isPlayer0 ? 2 : 3) ? 'Yes' : 'No'}</div>
            <div>Opponent&apos;s lineup submitted: {gameState?.phase && gameState.phase >= (isPlayer0 ? 3 : 2) ? 'Yes' : 'No'}</div>
            {/*<div style={{ marginTop: 8, fontSize: 12, color: '#8a9ba8' }}>
              <div>Debug: Phase {gameState?.phase}, P0: {isPlayer0 ? 'Yes' : 'No'}, P1: {isPlayer1 ? 'Yes' : 'No'}</div>
              <div>Should show lineup: {
                (gameState?.phase === 1 && isPlayer0) ||
                  (gameState?.phase === 1 && isPlayer1 && !isEmptyAddress(gameState?.p0)) ||
                  (gameState?.phase === 2 && isPlayer1) ||
                  (gameState?.phase === 3 && isPlayer0) ||
                  (gameState?.phase === 4 && isPlayer0) ||
                  (gameState?.phase === 5 && isPlayer1) ? 'Yes' : 'No'
              }</div>
            </div>*/}
          </div>
        </div>

        {/* Lineup Controls */}
        {isSettingLineup && (
          <div style={{ background: '#0e1419', border: '1px solid #2b3a44', borderRadius: 8, padding: 12 }}>
            <div style={{ color: '#66fcf1', fontWeight: 'bold', marginBottom: 12, textAlign: 'center' }}>
              Set Your Lineup
            </div>
            <div style={{ fontSize: 14, color: '#c5c6c7', marginBottom: 16, textAlign: 'center' }}>
              Arrange your pieces: 4 Stones, 4 Paper, 4 Scissors, 1 Flag, 1 Trap
            </div>
            <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
              <button
                onClick={handleShuffleLineup}
                style={{
                  background: '#2b3a44',
                  color: '#c5c6c7',
                  border: '1px solid #2b3a44',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: 14,
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#3a4a54';
                  e.currentTarget.style.borderColor = '#66fcf1';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = '#2b3a44';
                  e.currentTarget.style.borderColor = '#2b3a44';
                }}
              >
                🔀 Shuffle
              </button>
              <button
                onClick={handleSubmitLineup}
                style={{
                  background: '#66fcf1',
                  color: '#0e1419',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 'bold',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#5ae5d8';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = '#66fcf1';
                }}
              >
                ✅ Submit Lineup
              </button>
            </div>
          </div>
        )}

        <div style={{ height: 260, background: '#0e1419', border: '1px solid #2b3a44', borderRadius: 8, padding: 12 }}>
          <strong style={{ color: '#c5c6c7' }}>Player Info</strong>
          <div style={{ marginTop: 8, fontSize: 14, color: '#c5c6c7' }}>
            <div>You are: {isPlayer0 ? 'Player 0' : isPlayer1 ? 'Player 1' : 'Unknown'}</div>
            <div>Your turn: {isMyTurn ? 'Yes' : 'No'}</div>
            <div>You are WINNER: {isPlayer0 && gameState?.p0.toString() == gameState?.winner?.toString() ? 'YES' : 'NO'}</div>
            <div style={{ marginTop: 8 }}>
              <div>Player 0: {gameState?.p0 ? `${String(gameState.p0).slice(0, 8)}...` : 'Unknown'}</div>
              <div>Player 1: {gameState?.p1 ? `${String(gameState.p1).slice(0, 8)}...` : 'Unknown'}</div>
            </div>
            
          </div>
        </div>
        <div style={{ height: 200, background: '#0e1419', border: '1px solid #2b3a44', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, color: '#66fcf1' }}>{gameState?.live0 || 0}</div>
            <div style={{ fontSize: 14, color: '#c5c6c7' }}>vs</div>
            <div style={{ fontSize: 24, color: '#66fcf1' }}>{gameState?.live1 || 0}</div>
          </div>
        </div>

        {/* Debug Info 
        {gameState && (
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ color: '#66fcf1', fontWeight: 'bold', marginBottom: 8 }}>Debug Info</div>
            <div style={{ fontSize: 12, color: '#c5c6c7' }}>
              <div>Phase: {gameState.phase}</div>
              <div>isPlayer0: {isPlayer0 ? 'Yes' : 'No'}</div>
              <div>isPlayer1: {isPlayer1 ? 'Yes' : 'No'}</div>
              <div>isAuthorized: {isAuthorized ? 'Yes' : 'No'}</div>
              <div>isSettingLineup: {isSettingLineup ? 'Yes' : 'No'}</div>
              <div>myLineup.length: {myLineup.length}</div>
              <div>P0: {gameState.p0?.toString()}</div>
              <div>P1: {gameState.p1?.toString()}</div>
            </div>
          </div>
        )}*/}

      </aside>

      {/* Weapon Selection Popup */}
      <WeaponSelectionPopup
        isOpen={showWeaponPopup}
        onWeaponSelect={handleWeaponSelection}
        onClose={() => {
          setShowWeaponPopup(false);
          setPendingAttack(null);
        }}
      />
    </main>
  );
}