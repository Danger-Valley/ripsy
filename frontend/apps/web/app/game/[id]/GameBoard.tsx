"use client";

import { isMovablePiece, Owner, Phase, Piece, toIdx, WIDTH, HEIGHT, type GameState } from '@rps/core';
import { useRiveFile } from '@rive-app/react-canvas';
import RpsFigure, { Weapon, type TriggerName } from './RpsFigure';
import { RIVE_JUMP_TRAVEL_DELAY_MS, pieceMoveDurationMs, type CombatAnimation, type CombatAnimationPhase, type PieceMoveAnimation, type TrapAnimation } from './game-animation';
import styles from './game.module.css';

export interface LineupPiece { x: number; y: number; piece: Piece }
type Coordinate = { x: number; y: number };

interface Props {
  state: GameState;
  ownOwner: Owner;
  isPlayer1: boolean;
  previewLineup?: LineupPiece[];
  selected: Coordinate | null;
  availableMoves: Coordinate[];
  interactionEnabled: boolean;
  moveAnimation: PieceMoveAnimation | null;
  movePhase: 'takeoff' | 'travel' | 'landing' | null;
  combatAnimation: CombatAnimation | null;
  combatPhase: CombatAnimationPhase | null;
  trapAnimation: TrapAnimation | null;
  showOpponentFormation: boolean;
  onCellPress: (coordinate: Coordinate) => void;
  onMoveActionTriggered: () => void;
  onTrapActionTriggered: (trigger: 'Trap Activate' | 'Fall In Trap') => void;
}

export function GameBoard(props: Props) {
  const { riveFile, status: riveStatus } = useRiveFile({ src: '/figures/fig1.riv' });
  const riveReady = riveStatus === 'success' && riveFile ? riveFile : null;
  const preview = new Map(props.previewLineup?.map(item => [toIdx(item.x, item.y), item.piece]));
  return (
    <div className={styles.board} aria-label="RIPSY game board">
      <div className={styles.boardSurface} aria-hidden>
        {Array.from({ length: WIDTH * HEIGHT }, (_, index) => <i key={index} />)}
      </div>
      <div className={styles.cellLayer}>
        {Array.from({ length: WIDTH * HEIGHT }, (_, displayIndex) => {
          const display = { x: displayIndex % WIDTH, y: Math.floor(displayIndex / WIDTH) };
          const coordinate = fromDisplay(display, props.isPlayer1);
          const index = toIdx(coordinate.x, coordinate.y);
          const previewPiece = preview.get(index);
          const serverOwner = props.state.owners[index] ?? Owner.None;
          const opponentPreview = props.showOpponentFormation && display.y < 2 && previewPiece === undefined && serverOwner === Owner.None;
          const movingSource = same(props.moveAnimation?.from, coordinate);
          const movingDestination = same(props.moveAnimation?.to, coordinate);
          const owner = movingSource && props.moveAnimation
            ? props.moveAnimation.owner
            : previewPiece !== undefined ? props.ownOwner : opponentPreview ? opponentOf(props.ownOwner) : serverOwner;
          const piece = movingSource && props.moveAnimation
            ? props.moveAnimation.piece
            : previewPiece ?? props.state.pieces[index] ?? Piece.Empty;
          const isMine = owner === props.ownOwner && props.ownOwner !== Owner.None;
          const combatLanding = Boolean(props.combatAnimation?.resolution === 'resolved' && props.combatPhase === 'settle' && same(props.combatAnimation.to, coordinate));
          const combatant = Boolean(props.combatAnimation && !combatLanding && (same(props.combatAnimation.from, coordinate) || same(props.combatAnimation.to, coordinate)));
          const trapDestination = same(props.trapAnimation?.to, coordinate);
          const selected = same(props.selected, coordinate);
          const available = props.availableMoves.some(move => same(move, coordinate));
          const actionable = props.interactionEnabled && (props.selected ? (isMine && isMovablePiece(piece)) || available : isMine && isMovablePiece(piece));
          return (
            <button
              aria-label={`Row ${display.y + 1}, column ${display.x + 1}, ${owner === Owner.None ? 'empty' : isMine ? `your ${pieceName(piece)}` : 'opponent piece'}`}
              aria-pressed={selected}
              className={`${styles.cell} ${available ? styles.availableCell : ''} ${selected ? styles.selectedCell : ''} ${trapDestination ? styles.trapDestinationCell : ''}`}
              disabled={!actionable}
              key={displayIndex}
              onClick={() => props.onCellPress(coordinate)}
            >
              {owner !== Owner.None && !combatant && (
                <div
                  className={`${styles.pieceVisual} ${movingSource ? styles.movingPiece : ''} ${(movingDestination || combatLanding) ? styles.preloadedPiece : ''}`}
                  style={movingSource && props.moveAnimation ? moveStyle(props.moveAnimation, props.movePhase, props.isPlayer1) : undefined}
                >
                  {riveReady ? <RpsFigure
                    isMyFigure={isMine}
                    onActionTriggered={trapDestination ? trigger => props.onTrapActionTriggered(trigger as 'Trap Activate') : movingSource ? props.onMoveActionTriggered : undefined}
                    riveFile={riveReady}
                    staggerStart={opponentPreview}
                    style={{ width: '168%', height: '168%', position: 'absolute', inset: '-34%' }}
                    trigger={trapDestination ? 'Trap Activate' : movingSource && props.moveAnimation ? jumpTrigger(props.moveAnimation, props.isPlayer1) : undefined}
                    weapon={piece as Weapon}
                  /> : null}
                </div>
              )}
              {available && props.selected && <img alt="" className={styles.moveArrow} src={`/arrows/${arrowDirection(props.selected, coordinate, props.isPlayer1)}.png`} />}
            </button>
          );
        })}
      </div>
      {riveReady && props.combatAnimation && props.combatPhase && (
        <CombatScene combat={props.combatAnimation} isPlayer1={props.isPlayer1} ownOwner={props.ownOwner} phase={props.combatPhase} riveFile={riveReady} />
      )}
      {riveReady && props.trapAnimation && (
        <TrapScene animation={props.trapAnimation} isPlayer1={props.isPlayer1} onActionTriggered={props.onTrapActionTriggered} ownOwner={props.ownOwner} riveFile={riveReady} />
      )}
    </div>
  );
}

function TrapScene({ animation, isPlayer1, onActionTriggered, ownOwner, riveFile }: { animation: TrapAnimation; isPlayer1: boolean; onActionTriggered: Props['onTrapActionTriggered']; ownOwner: Owner; riveFile: unknown }) {
  const destination = toDisplay(animation.to, isPlayer1);
  return <div className={styles.trapLayer}>
    <div className={styles.trapVictim} style={{ '--trap-left': `${destination.x / WIDTH * 100}%`, '--trap-top': `${destination.y / HEIGHT * 100}%` } as React.CSSProperties}>
      <div className={styles.pieceVisual}>
        <RpsFigure isMyFigure={animation.attackerOwner === ownOwner} onActionTriggered={trigger => onActionTriggered(trigger as 'Fall In Trap')} preserveStateOnWeaponChange riveFile={riveFile} style={{ width: '168%', height: '168%', position: 'absolute', inset: '-34%' }} trigger="Fall In Trap" weapon={animation.attackerPiece as Weapon} />
      </div>
    </div>
  </div>;
}

function CombatScene({ combat, isPlayer1, ownOwner, phase, riveFile }: { combat: CombatAnimation; isPlayer1: boolean; ownOwner: Owner; phase: CombatAnimationPhase; riveFile: unknown }) {
  const attacker = toDisplay(combat.from, isPlayer1);
  const defender = toDisplay(combat.to, isPlayer1);
  const attackerOnLeft = attacker.x <= defender.x;
  return <div className={styles.combatLayer}>
    <Combatant combat={combat} faceRight={attackerOnLeft} isMine={combat.attackerOwner === ownOwner} isWinner={combat.winnerOwner === combat.attackerOwner} phase={phase} piece={combat.attackerPiece} position={attacker} target={defender} targetSide={attackerOnLeft ? -1 : 1} riveFile={riveFile} />
    <Combatant combat={combat} faceRight={!attackerOnLeft} isMine={combat.defenderOwner === ownOwner} isWinner={combat.winnerOwner === combat.defenderOwner} phase={phase} piece={combat.defenderPiece} position={defender} target={attacker} targetSide={attackerOnLeft ? 1 : -1} riveFile={riveFile} />
  </div>;
}

function Combatant({ combat, faceRight, isMine, isWinner, phase, piece, position, target, targetSide, riveFile }: { combat: CombatAnimation; faceRight: boolean; isMine: boolean; isWinner: boolean; phase: CombatAnimationPhase; piece: Piece; position: Coordinate; target: Coordinate; targetSide: -1 | 1; riveFile: unknown }) {
  const centerX = (position.x + target.x + 1) / 2;
  const centerY = (position.y + target.y + 1) / 2;
  const fightX = centerX + targetSide * .42 - .5;
  const fightY = centerY - .5;
  const settled = phase === 'settle' && isWinner;
  const left = settled ? target.x : fightX;
  const top = settled ? target.y : fightY;
  const scale = settled ? 1 : 2;
  const hidden = (phase === 'death' || phase === 'settle') && !isWinner;
  const trigger: TriggerName | undefined = phase === 'prepare' ? 'Attack Prepare' : phase === 'attack' && isWinner ? 'Attack' : phase === 'death' && !isWinner ? 'Death' : undefined;
  return (
    <div
      className={`${styles.combatant} ${phase === 'prepare' ? styles.combatApproach : ''} ${phase === 'settle' ? styles.combatSettle : ''}`}
      style={{ '--start-left': `${position.x / WIDTH * 100}%`, '--start-top': `${position.y / HEIGHT * 100}%`, '--combat-left': `${left / WIDTH * 100}%`, '--combat-top': `${top / HEIGHT * 100}%`, '--combat-scale': scale, '--face': faceRight ? 1 : -1, opacity: hidden ? 0 : 1 } as React.CSSProperties}
    >
      <div className={styles.pieceVisual}>
        {riveFile ? <RpsFigure isMyFigure={isMine} preserveStateOnWeaponChange riveFile={riveFile} style={{ width: '168%', height: '168%', position: 'absolute', inset: '-34%' }} trigger={trigger} weapon={piece as Weapon} /> : null}
      </div>
    </div>
  );
}

function moveStyle(move: PieceMoveAnimation, phase: Props['movePhase'], isPlayer1: boolean) {
  const from = toDisplay(move.from, isPlayer1);
  const to = toDisplay(move.to, isPlayer1);
  const traveling = phase === 'travel' || phase === 'landing';
  return {
    '--move-x': `${traveling ? (to.x - from.x) / .88 * 100 : 0}%`,
    '--move-y': `${traveling ? (to.y - from.y) / .88 * 100 : 0}%`,
    '--move-ms': `${Math.max(1, pieceMoveDurationMs(move) - RIVE_JUMP_TRAVEL_DELAY_MS)}ms`,
  } as React.CSSProperties;
}

function jumpTrigger(move: PieceMoveAnimation, isPlayer1: boolean): TriggerName {
  const from = toDisplay(move.from, isPlayer1);
  const to = toDisplay(move.to, isPlayer1);
  if (to.x < from.x) return 'Jump Left';
  if (to.x > from.x) return 'Jump Right';
  return 'Jump Forward';
}
function arrowDirection(from: Coordinate, to: Coordinate, isPlayer1: boolean) { const dx = (to.x - from.x) * (isPlayer1 ? -1 : 1); const dy = (to.y - from.y) * (isPlayer1 ? -1 : 1); return dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up'; }
function toDisplay(coordinate: Coordinate, isPlayer1: boolean) { return isPlayer1 ? { x: WIDTH - 1 - coordinate.x, y: HEIGHT - 1 - coordinate.y } : coordinate; }
function fromDisplay(coordinate: Coordinate, isPlayer1: boolean) { return toDisplay(coordinate, isPlayer1); }
function same(a: Coordinate | null | undefined, b: Coordinate) { return Boolean(a && a.x === b.x && a.y === b.y); }
function opponentOf(owner: Owner) { return owner === Owner.P0 ? Owner.P1 : owner === Owner.P1 ? Owner.P0 : Owner.None; }
function pieceName(piece: Piece) { return piece === Piece.Rock ? 'rock' : piece === Piece.Paper ? 'paper' : piece === Piece.Scissors ? 'scissors' : piece === Piece.Flag ? 'flag' : piece === Piece.Trap ? 'trap' : 'piece'; }
