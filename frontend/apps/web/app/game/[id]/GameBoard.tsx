"use client";

import { FigureVariant, isMovablePiece, Owner, Phase, Piece, toIdx, WIDTH, HEIGHT, type GameState } from '@rps/core';
import { useRiveFile } from '@rive-app/react-canvas';
import RpsFigure, { Weapon, type TriggerName } from './RpsFigure';
import { RIVE_JUMP_TRAVEL_DELAY_MS, pieceMoveDurationMs, type CombatAnimation, type CombatAnimationPhase, type PieceMoveAnimation, type TrapAnimation } from './game-animation';
import styles from './game.module.css';

export interface LineupPiece { x: number; y: number; piece: Piece; figureVariant?: FigureVariant }
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
  trapAnimationSequence: number;
  showOpponentFormation: boolean;
  onCellPress: (coordinate: Coordinate) => void;
  onMoveActionTriggered: () => void;
  onTrapActionTriggered: (trigger: 'Trap Activate' | 'Fall In Trap') => void;
}

export function GameBoard(props: Props) {
  const { riveFile: figure1File, status: figure1Status } = useRiveFile({ src: '/figures/fig1.riv' });
  const { riveFile: figure2File, status: figure2Status } = useRiveFile({ src: '/figures/fig2.riv' });
  const figuresReady = figure1Status === 'success' && figure1File && figure2Status === 'success' && figure2File;
  const preview = new Map(props.previewLineup?.map(item => [toIdx(item.x, item.y), item]));
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
          const previewItem = preview.get(index);
          const serverOwner = props.state.owners[index] ?? Owner.None;
          const opponentPreview = props.showOpponentFormation && display.y < 2 && previewItem === undefined && serverOwner === Owner.None;
          const movingSource = same(props.moveAnimation?.from, coordinate);
          const movingDestination = same(props.moveAnimation?.to, coordinate);
          const owner = movingSource && props.moveAnimation
            ? props.moveAnimation.owner
            : previewItem !== undefined ? props.ownOwner : opponentPreview ? opponentOf(props.ownOwner) : serverOwner;
          const piece = movingSource && props.moveAnimation
            ? props.moveAnimation.piece
            : previewItem?.piece ?? props.state.pieces[index] ?? Piece.Empty;
          const figureVariant = movingSource && props.moveAnimation
            ? props.moveAnimation.figureVariant
            : previewItem?.figureVariant
              ?? (opponentPreview
                ? (displayIndex % 2 === 0 ? FigureVariant.Fig1 : FigureVariant.Fig2)
                : props.state.figureVariants?.[index] ?? FigureVariant.Fig1);
          const riveFile = figureVariant === FigureVariant.Fig2 ? figure2File : figure1File;
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
                  {figuresReady && riveFile ? <RpsFigure
                    isMyFigure={isMine}
                    key={trapDestination ? `trap-${props.trapAnimationSequence}` : 'piece'}
                    onActionTriggered={trapDestination ? trigger => props.onTrapActionTriggered(trigger as 'Trap Activate') : movingSource ? props.onMoveActionTriggered : undefined}
                    riveFile={riveFile}
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
      {figuresReady && props.combatAnimation && props.combatPhase && (
        <CombatScene combat={props.combatAnimation} figure1File={figure1File} figure2File={figure2File} isPlayer1={props.isPlayer1} ownOwner={props.ownOwner} phase={props.combatPhase} />
      )}
      {figuresReady && props.trapAnimation && (
        <TrapScene animation={props.trapAnimation} isPlayer1={props.isPlayer1} key={`trap-victim-${props.trapAnimationSequence}`} onActionTriggered={props.onTrapActionTriggered} ownOwner={props.ownOwner} riveFile={props.trapAnimation.attackerFigureVariant === FigureVariant.Fig2 ? figure2File : figure1File} />
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

function CombatScene({ combat, figure1File, figure2File, isPlayer1, ownOwner, phase }: { combat: CombatAnimation; figure1File: unknown; figure2File: unknown; isPlayer1: boolean; ownOwner: Owner; phase: CombatAnimationPhase }) {
  const attacker = toDisplay(combat.from, isPlayer1);
  const defender = toDisplay(combat.to, isPlayer1);
  const attackerIsMine = combat.attackerOwner === ownOwner;
  const defenderIsMine = combat.defenderOwner === ownOwner;
  return <div className={styles.combatLayer}>
    <Combatant combat={combat} isMine={attackerIsMine} isWinner={combat.winnerOwner === combat.attackerOwner} phase={phase} piece={combat.attackerPiece} position={attacker} target={defender} targetSide={attackerIsMine ? -1 : 1} riveFile={combat.attackerFigureVariant === FigureVariant.Fig2 ? figure2File : figure1File} />
    <Combatant combat={combat} isMine={defenderIsMine} isWinner={combat.winnerOwner === combat.defenderOwner} phase={phase} piece={combat.defenderPiece} position={defender} target={attacker} targetSide={defenderIsMine ? -1 : 1} riveFile={combat.defenderFigureVariant === FigureVariant.Fig2 ? figure2File : figure1File} />
  </div>;
}

function Combatant({ combat, isMine, isWinner, phase, piece, position, target, targetSide, riveFile }: { combat: CombatAnimation; isMine: boolean; isWinner: boolean; phase: CombatAnimationPhase; piece: Piece; position: Coordinate; target: Coordinate; targetSide: -1 | 1; riveFile: unknown }) {
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
      style={{ '--start-left': `${position.x / WIDTH * 100}%`, '--start-top': `${position.y / HEIGHT * 100}%`, '--combat-left': `${left / WIDTH * 100}%`, '--combat-top': `${top / HEIGHT * 100}%`, '--combat-scale': scale, opacity: hidden ? 0 : 1 } as React.CSSProperties}
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
