"use client";
import { useMemo, useState, useEffect } from 'react';
import { useRiveFile } from '@rive-app/react-canvas';
import { useParams } from 'next/navigation';
import { useSolanaWallet } from '../../hooks/useSolanaWallet';
import RpsFigure, { Weapon, WEAPON_NAMES } from './RpsFigure';
import WeaponSelectionPopup from './WeaponSelectionPopup';
import { useRipsyGame, Phase, Choice, Piece, Owner, toIdx, toXY } from '@rps/solana-client';

interface Figure {
  id: string;
  row: number;
  col: number;
  weapon: Weapon;
  isMyFigure: boolean;
  isAlive: boolean;
  isMoving?: boolean;
  oldRow?: number;
  oldCol?: number;
  animX?: number;
  animY?: number;
}

// Game constants
const DISTANCE_BETWEEN_FIGURES_DURING_ATTACK = 40;

export default function GamePageSmartContract() {
  // Load shared Rive file once and share across all figures
  const { riveFile, status: riveStatus } = useRiveFile({ src: '/figures/fig1.riv' });
  const { id } = useParams<{ id: string }>();
  const { connected, publicKey } = useSolanaWallet();
  
  // Use game PDA from URL (id is the game's Public Derived Address)
  const gamePda = id as string;
  
  // Initialize smart contract integration
  const {
    gameState,
    loading,
    error,
    createGame,
    joinGame,
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
  } = useRipsyGame(gamePda);

  const rows = 6;
  const cols = 7;
  const cells = useMemo(() => Array.from({ length: rows * cols }), []);

  // Track window size for responsive calculations
  const [windowWidth, setWindowWidth] = useState(0);
  const [boardRef, setBoardRef] = useState<HTMLDivElement | null>(null);
  
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    // Set initial width
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Convert smart contract state to frontend figures
  const [figures, setFigures] = useState<Figure[]>([]);
  
  useEffect(() => {
    if (!gameState) return;
    
    const newFigures: Figure[] = [];
    let figureId = 0;
    
    // Convert board state to figures
    for (let i = 0; i < gameState.owners.length; i++) {
      const owner = gameState.owners[i];
      const piece = gameState.pieces[i];
      const { x, y } = toXY(i);
      
      if (owner !== Owner.None && piece !== Piece.Empty) {
        const isMyFigure = (owner === Owner.P0 && isPlayer0) || (owner === Owner.P1 && isPlayer1);
        
        newFigures.push({
          id: `figure-${figureId++}`,
          row: y,
          col: x,
          weapon: piece as Weapon,
          isMyFigure,
          isAlive: true
        });
      }
    }
    
    setFigures(newFigures);
  }, [gameState, isPlayer0, isPlayer1]);

  // Calculate responsive cell dimensions for positioning
  const actualBoardWidth = boardRef?.clientWidth || (windowWidth > 0 ? Math.min(840, windowWidth * 0.9) : 840);
  const actualBoardHeight = boardRef?.clientHeight || (actualBoardWidth * rows) / cols;
  const actualCellWidth = actualBoardWidth / cols;
  const actualCellHeight = actualBoardHeight / rows;
  
  const cellSize = Math.min(actualCellWidth, actualCellHeight);
  const figureSize = cellSize * 1.5;
  const figureScale = 1.0;

  // Animation trigger - track which figure should animate
  const [animatingFigure, setAnimatingFigure] = useState<string | null>(null);
  const [jumpDirection, setJumpDirection] = useState<'Jump Forward' | 'Jump Left' | 'Jump Right'>('Jump Forward');
  
  // Attack system
  const [attackingFigures, setAttackingFigures] = useState<string[]>([]);
  const [attackPositions, setAttackPositions] = useState<{[key: string]: {x: number, y: number}}>({});
  const [scaledFigures, setScaledFigures] = useState<string[]>([]);
  const [attackPhase, setAttackPhase] = useState<'prepare' | 'attack' | null>(null);
  const [dyingFigures, setDyingFigures] = useState<string[]>([]);
  const [winningFigure, setWinningFigure] = useState<string | null>(null);
  
  // Movement system
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [availableMoves, setAvailableMoves] = useState<{row: number, col: number, direction: string}[]>([]);
  
  // Weapon selection popup for ties
  const [showWeaponPopup, setShowWeaponPopup] = useState(false);
  const [pendingAttack, setPendingAttack] = useState<{attacker: Figure, target: Figure} | null>(null);

  // Handle weapon selection from popup
  const handleWeaponSelection = async (selectedWeapon: Weapon) => {
    if (!pendingAttack || !gameState) return;
    
    try {
      // Convert weapon to Choice enum
      const choice = selectedWeapon as Choice;
      await chooseWeapon(choice);
      
      // Close popup
      setShowWeaponPopup(false);
      setPendingAttack(null);
      
      // Refresh game state to get updated state
      await refreshGameState();
    } catch (err) {
      console.error('Failed to choose weapon:', err);
    }
  };

  const getAvailableMovesForFigure = (figure: Figure) => {
    if (!gameState) return [];
    
    const moves = getAvailableMoves(figure.col, figure.row);
    return moves.map(move => ({
      row: move.y,
      col: move.x,
      direction: 'up' // We'll determine direction based on movement
    }));
  };

  const handleCellClick = async (cellKey: number, figure: Figure | null) => {
    if (!gameState || !isMyTurn) return;
    
    console.log('Cell clicked:', cellKey, 'figure:', figure);
    
    // If clicking on a selected figure, deselect it
    if (selectedFigure && figure && figure.id === selectedFigure.id) {
      setSelectedFigure(null);
      setAvailableMoves([]);
      return;
    }
    
    // If clicking on one of my figures, select it and show available moves
    if (figure && figure.isMyFigure) {
      const moves = getAvailableMovesForFigure(figure);
      setSelectedFigure(figure);
      setAvailableMoves(moves);
      console.log('Selected figure:', figure.id, 'Available moves:', moves);
      return;
    }
    
    // If clicking on an opponent figure and I have a selected figure, check if it's adjacent
    if (selectedFigure && figure && !figure.isMyFigure) {
      const cellRow = Math.floor(cellKey / cols);
      const cellCol = cellKey % cols;
      const isAdjacent = Math.abs(selectedFigure.row - cellRow) + Math.abs(selectedFigure.col - cellCol) === 1;
      
      if (isAdjacent) {
        console.log('Attacking opponent figure:', figure.id);
        await attackFigure(selectedFigure, figure);
        setSelectedFigure(null);
        setAvailableMoves([]);
        return;
      }
    }
    
    // If clicking on an available move cell, move the figure
    if (selectedFigure && !figure) {
      const move = availableMoves.find(move => {
        const cellRow = Math.floor(cellKey / cols);
        const cellCol = cellKey % cols;
        return move.row === cellRow && move.col === cellCol;
      });
      
      if (move) {
        console.log('Moving figure to:', move);
        await moveFigure(selectedFigure, move.row, move.col);
        setSelectedFigure(null);
        setAvailableMoves([]);
        return;
      }
    }
    
    // If clicking elsewhere, deselect
    setSelectedFigure(null);
    setAvailableMoves([]);
  };

  const moveFigure = async (figure: Figure, newRow: number, newCol: number) => {
    if (!gameState) return;
    
    try {
      // Call smart contract move
      await movePiece(figure.col, figure.row, newCol, newRow);
      
      // Update local state for animation
      setFigures(prevFigures => 
        prevFigures.map(f => 
          f.id === figure.id 
            ? { ...f, row: newRow, col: newCol }
            : f
        )
      );
      
      // Refresh game state
      await refreshGameState();
    } catch (err) {
      console.error('Failed to move piece:', err);
    }
  };

  const attackFigure = async (attacker: Figure, target: Figure) => {
    if (!gameState) return;
    
    console.log('Attack initiated:', attacker.id, 'attacks', target.id);
    
    // Check if there's a tie pending
    if (gameState.tiePending) {
      console.log('Tie detected! Showing weapon selection popup');
      setPendingAttack({ attacker, target });
      setShowWeaponPopup(true);
      return;
    }
    
    // No tie, proceed with normal attack logic
    await proceedWithAttack(attacker, target);
  };

  const proceedWithAttack = async (attacker: Figure, target: Figure) => {
    console.log('Proceeding with attack:', attacker.id, 'attacks', target.id);
    
    try {
      // Call smart contract move (this will handle the attack logic)
      await movePiece(attacker.col, attacker.row, target.col, target.row);
      
      // Refresh game state to get updated board
      await refreshGameState();
    } catch (err) {
      console.error('Failed to execute attack:', err);
    }
  };

  // Handle game phase transitions
  const handleGamePhase = async () => {
    if (!gameState || !connected) return;
    
    switch (gameState.phase) {
      case Phase.Created:
        // Auto-join if not player0
        if (!isPlayer0 && publicKey) {
          try {
            await joinGame(gamePda);
          } catch (err) {
            console.error('Failed to join game:', err);
          }
        }
        break;
      case Phase.Joined:
        // Show flag placement UI
        break;
      case Phase.Active:
        // Game is active, show game board
        break;
      case Phase.Finished:
        // Game is finished
        break;
    }
  };

  useEffect(() => {
    handleGamePhase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.phase, connected, isPlayer0, publicKey]);

  // Show loading state
  if (loading) {
    return (
      <main style={{ padding: 24, textAlign: 'center' }}>
        <h2 style={{ color: '#66fcf1' }}>Loading game...</h2>
      </main>
    );
  }

  // Show error state
  if (error) {
    return (
      <main style={{ padding: 24, textAlign: 'center' }}>
        <h2 style={{ color: '#ff6b6b' }}>Error: {error}</h2>
        <button onClick={refreshGameState}>Retry</button>
      </main>
    );
  }

  // Show wallet connection prompt
  if (!connected) {
    return (
      <main style={{ padding: 24, textAlign: 'center' }}>
        <h2 style={{ color: '#66fcf1' }}>Please connect your wallet to play</h2>
      </main>
    );
  }

  // Show game not found
  if (!gameState) {
    return (
      <main style={{ padding: 24, textAlign: 'center' }}>
        <h2 style={{ color: '#66fcf1' }}>Game not found</h2>
        <button onClick={() => createGame()}>Create New Game</button>
      </main>
    );
  }

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
        <h2 style={{ color: '#66fcf1', marginTop: 0 }}>Game PDA: {gamePda}</h2>
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
                  cursor: figure?.isMyFigure || availableMove ? 'pointer' : 'default',
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
          {riveStatus === 'success' && figures.filter(f => f.isAlive).map((figure) => {
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
                  zIndex: attackingFigures.includes(figure.id) ? 20 : 5,
                  transition: attackPos ? 'left 0.3s ease-in-out, top 0.3s ease-in-out' : 'none'
                }}
              >
                  <RpsFigure
                    riveFile={riveFile as any}
                    weapon={figure.weapon}
                    trigger={
                      isAnimating ? jumpDirection : 
                      attackingFigures.includes(figure.id) ? 
                        (attackPhase === 'prepare' ? 'Attack Prepare' : 
                         dyingFigures.includes(figure.id) ? 'Death' :
                         winningFigure === figure.id ? 'Attack' : 'Death') : 
                      undefined
                    }
                    isMyFigure={figure.isMyFigure}
                    style={{ 
                      width: `${figureSize}px`, 
                      height: `${figureSize}px`, 
                      transform: `scale(${scaledFigures.includes(figure.id) ? figureScale * 2 : figureScale})${!figure.isMyFigure ? ' scaleX(-1)' : ''}`, 
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
        <div style={{ height: 160, background: '#0e1419', border: '1px solid #2b3a44', borderRadius: 8, padding: 12 }}>
          <strong style={{ color: '#c5c6c7' }}>Game Phase: {gameState.phase}</strong>
          <br />
          <span style={{ color: '#c5c6c7' }}>Turn: {gameState.isP1Turn ? 'Player 1' : 'Player 0'}</span>
          <br />
          <span style={{ color: '#c5c6c7' }}>My Turn: {isMyTurn ? 'Yes' : 'No'}</span>
        </div>
        <div style={{ height: 260, background: '#0e1419', border: '1px solid #2b3a44', borderRadius: 8, padding: 12 }}>
          <strong style={{ color: '#c5c6c7' }}>Players</strong>
          <br />
          <span style={{ color: '#c5c6c7' }}>P0: {gameState.p0}</span>
          <br />
          <span style={{ color: '#c5c6c7' }}>P1: {gameState.p1}</span>
          <br />
          <span style={{ color: '#c5c6c7' }}>You are: {isPlayer0 ? 'Player 0' : isPlayer1 ? 'Player 1' : 'Observer'}</span>
        </div>
        <div style={{ height: 200, background: '#0e1419', border: '1px solid #2b3a44', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 64, color: '#ffffff' }}>{gameState.live0 + gameState.live1}</span>
        </div>
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
