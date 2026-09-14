"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Choice, isMovablePiece, Owner, Phase, Piece, toIdx, WIDTH, HEIGHT, type GameState } from '@rps/core';
import { usePlayerIdentity, useRipsyGame } from '@rps/game-client';
import { toast } from 'sonner';
import { GameBoard, type LineupPiece } from './GameBoard';
import { useWebAnimationQueue } from './use-web-animation-queue';
import styles from './game.module.css';

type Coordinate = { x: number; y: number };
type JoinStatus = 'idle' | 'joining' | 'joined' | 'failed';
const LAST_GAME_KEY = 'ripsy.last-game.v1';

export interface BattleController {
  gameState: GameState | null;
  error: string | null;
  isBusy: boolean;
  isPlayer0: boolean;
  isPlayer1: boolean;
  ownOwner: Owner;
  isMyTurn: boolean;
  joinGame: (gameId?: string) => Promise<unknown>;
  refresh: () => Promise<unknown>;
  submitCustomLineup: (xs: number[], ys: number[], pieces: number[]) => Promise<unknown>;
  movePiece: (fromX: number, fromY: number, toX: number, toY: number) => Promise<unknown>;
  chooseWeapon: (choice: Choice) => Promise<unknown>;
}

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const gameId = normalizeRoomCode(params.id);
  const router = useRouter();
  const { playerId } = usePlayerIdentity();
  const game = useRipsyGame(gameId);
  return <BattleScreen game={game} gameId={gameId} playerId={playerId} />;
}

export function BattleScreen({ game, gameId, playerId, isComputer = false, onAnimationStateChange }: { game: BattleController; gameId: string; playerId: string; isComputer?: boolean; onAnimationStateChange?: (busy: boolean) => void }) {
  const router = useRouter();
  const animation = useWebAnimationQueue(game.gameState);
  const visibleState = animation.displayedState ?? game.gameState;
  const [lineup, setLineup] = useState<LineupPiece[]>([]);
  const [lineupDirty, setLineupDirty] = useState(false);
  const [selected, setSelected] = useState<Coordinate | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>('idle');
  const [joinError, setJoinError] = useState<string | null>(null);

  const isParticipant = game.isPlayer0 || game.isPlayer1;
  const hasSubmitted = Boolean(game.gameState && (game.isPlayer0
    ? game.gameState.phase === Phase.LineupP0Set || game.gameState.phase >= Phase.Active
    : game.gameState.phase === Phase.LineupP1Set || game.gameState.phase >= Phase.Active));
  const lineupSaved = hasSubmitted && !lineupDirty;
  const canEditLineup = Boolean(isParticipant && game.gameState && game.gameState.phase < Phase.Active);
  const waitingForOpponent = Boolean(!isComputer && game.isPlayer0 && game.gameState && !game.gameState.p1 && game.gameState.phase < Phase.Active);
  const hasOpenSlot = Boolean(game.gameState && !isParticipant && !game.gameState.p1 && (game.gameState.phase === Phase.Created || game.gameState.phase === Phase.LineupP0Set));

  useEffect(() => { onAnimationStateChange?.(animation.isAnimating); }, [animation.isAnimating, onAnimationStateChange]);
  useEffect(() => () => onAnimationStateChange?.(false), [onAnimationStateChange]);

  useEffect(() => {
    setJoinStatus('idle');
    setJoinError(null);
  }, [gameId]);

  useEffect(() => {
    if (!hasOpenSlot || joinStatus !== 'idle') return;
    setJoinStatus('joining');
    game.joinGame(gameId)
      .then(() => setJoinStatus('joined'))
      .catch(cause => {
        setJoinStatus('failed');
        setJoinError(cause instanceof Error ? cause.message : 'Could not join this battle');
      });
  }, [game, gameId, hasOpenSlot, joinStatus]);

  useEffect(() => {
    if (isComputer) return;
    if (!game.gameState) return;
    if (game.gameState.phase === Phase.Finished) {
      if (localStorage.getItem(LAST_GAME_KEY) === gameId) localStorage.removeItem(LAST_GAME_KEY);
    } else if (isParticipant) localStorage.setItem(LAST_GAME_KEY, gameId);
  }, [game.gameState, gameId, isComputer, isParticipant]);

  useEffect(() => {
    if (!canEditLineup || lineup.length || !game.gameState) return;
    const saved = lineupFromState(game.gameState, game.ownOwner);
    if (saved.length) {
      setLineup(saved);
      setLineupDirty(false);
    } else {
      setLineup(createRandomLineup(game.isPlayer0));
      setLineupDirty(true);
    }
  }, [canEditLineup, game.gameState, game.isPlayer0, game.ownOwner, lineup.length]);

  useEffect(() => { if (!game.gameState?.tiePending) setSelected(null); }, [game.gameState?.tiePending]);

  const availableMoves = useMemo(() => {
    if (!selected || animation.isAnimating || !game.isMyTurn || visibleState?.phase !== Phase.Active) return [];
    return [{ x: selected.x + 1, y: selected.y }, { x: selected.x - 1, y: selected.y }, { x: selected.x, y: selected.y + 1 }, { x: selected.x, y: selected.y - 1 }]
      .filter(position => position.x >= 0 && position.x < WIDTH && position.y >= 0 && position.y < HEIGHT);
  }, [animation.isAnimating, game.isMyTurn, selected, visibleState?.phase]);

  const perform = async (operation: () => Promise<unknown>) => {
    setActionError(null);
    try { await operation(); return true; }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Action failed'); return false; }
  };

  const saveLineup = async () => {
    const saved = await perform(() => game.submitCustomLineup(lineup.map(item => item.x), lineup.map(item => item.y), lineup.map(item => item.piece)));
    if (saved) {
      setLineupDirty(false);
      toast.success('Lineup saved. The battle can start at any moment.');
    }
  };

  const onCellPress = (coordinate: Coordinate) => {
    const state = visibleState;
    if (!state || animation.isAnimating || state.phase !== Phase.Active || !game.isMyTurn || state.tiePending) return;
    const index = toIdx(coordinate.x, coordinate.y);
    const owner = state.owners[index];
    const movable = isMovablePiece(state.pieces[index]!);
    if (!selected) {
      if (owner === game.ownOwner && movable) setSelected(coordinate);
      return;
    }
    if (owner === game.ownOwner) {
      if (movable) setSelected(same(selected, coordinate) ? null : coordinate);
      return;
    }
    if (!availableMoves.some(move => same(move, coordinate))) return;
    const from = selected;
    setSelected(null);
    perform(() => game.movePiece(from.x, from.y, coordinate.x, coordinate.y)).catch(() => undefined);
  };

  const shareRoom = async () => {
    const url = `${window.location.origin}/game/${gameId}`;
    if (navigator.share) await navigator.share({ title: 'Join my RIPSY game', text: 'Join my RIPSY battle', url });
    else { await navigator.clipboard.writeText(url); toast.success('Invite link copied'); }
  };

  if (!gameId) return <JoinGate gameId="Invalid ID" title="Invalid battle link" copy="This invitation contains an invalid room code." onBack={() => router.replace('/')} />;
  if (!game.gameState) return <JoinGate busy={!game.error} gameId={gameId} title={game.error ? 'Couldn’t open battle' : 'Opening battle'} copy={game.error || 'Checking the room and its player slot…'} onBack={() => router.replace('/')} onRetry={game.error ? () => game.refresh().catch(() => undefined) : undefined} />;
  if (!isParticipant) {
    if (hasOpenSlot && joinStatus !== 'failed') return <JoinGate busy gameId={gameId} title="Joining battle" copy="Your place is being secured. Your lineup is next." onBack={() => router.replace('/')} />;
    return <JoinGate gameId={gameId} title="Battle unavailable" copy={joinError || 'This room already has two players or the battle has started.'} onBack={() => router.replace('/')} onRetry={hasOpenSlot ? () => setJoinStatus('idle') : undefined} />;
  }

  const renderedState = visibleState ?? game.gameState;
  const statusMessage = animation.activeKind ? animation.activeKind === 'battle' ? 'Resolving battle…' : animation.activeKind === 'trap' ? 'Trap triggered…' : 'Moving piece…' : getStateMessage(renderedState, hasSubmitted, game.isMyTurn, playerId, isComputer);
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <button aria-label="Back to home" className={styles.backButton} onClick={() => router.replace('/')}>‹</button>
          <h1>{isComputer ? 'Battle vs Computer' : `Battle ${gameId}`}</h1>
          <span />
        </header>

        <div className={styles.battleLayout}>
          <div className={styles.statusColumn}>
            {waitingForOpponent ? (
              <section className={styles.waitingCard}>
                <span className={styles.waitingSignal}><i /></span>
                <div><h2>Waiting for opponent</h2><p>The board is a preview. Set your lineup with the highlighted controls.</p></div>
                <button onClick={() => shareRoom().catch(() => undefined)}>Invite opponent</button>
              </section>
            ) : <div className={`${styles.statusBanner} ${renderedState.phase === Phase.Finished ? styles.finishedBanner : ''}`}>{statusMessage}</div>}
            {actionError && <div className={styles.errorBanner}>{actionError}</div>}

            {(game.gameState.phase >= Phase.Active && game.gameState.finishReason !== 'lineup_timeout') && (
              <GameClocks state={game.gameState} ownOwner={game.ownOwner} />
            )}
          </div>

          <div className={styles.boardColumn}>
            <GameBoard
              availableMoves={availableMoves}
              combatAnimation={animation.activeCombat}
              combatPhase={animation.combatPhase}
              interactionEnabled={!animation.isAnimating && game.isMyTurn && renderedState.phase === Phase.Active && !renderedState.tiePending}
              isPlayer1={game.isPlayer1}
              moveAnimation={animation.activeMove}
              movePhase={animation.movePhase}
              onCellPress={onCellPress}
              onMoveActionTriggered={animation.startActiveMove}
              onTrapActionTriggered={animation.startActiveTrap}
              ownOwner={game.ownOwner}
              previewLineup={canEditLineup ? lineup : undefined}
              selected={selected}
              showOpponentFormation={canEditLineup}
              state={renderedState}
              trapAnimation={animation.activeTrap}
            />
          </div>

          {canEditLineup && (
            <section className={`${styles.lineupPanel} ${lineupSaved ? styles.lineupReady : styles.lineupAttention}`}>
              <div className={styles.lineupHeader}>
                <div>
                  <span className={styles.eyebrow}>{lineupSaved ? 'YOUR LINEUP' : 'SET YOUR LINEUP HERE ↓'}</span>
                  <p>{lineupSaved ? 'Saved. The battle starts automatically when your opponent is ready.' : hasSubmitted ? 'Lineup changed. Save it again.' : 'Shuffle, then save your hidden lineup.'}</p>
                </div>
                {lineupSaved ? <span className={styles.readyBadge}><i /> READY</span> : game.gameState.lineupDeadlineAt ? <LineupCountdown deadlineAt={game.gameState.lineupDeadlineAt} /> : null}
              </div>
              <div className={styles.lineupActions}>
                <button onClick={() => { setSelected(null); setLineup(createRandomLineup(game.isPlayer0)); setLineupDirty(true); }}>Shuffle</button>
                <button className={styles.primaryButton} disabled={lineupSaved || game.isBusy} onClick={() => saveLineup().catch(() => undefined)}>{lineupSaved ? 'Lineup saved' : hasSubmitted ? 'Save changes' : 'Save lineup'}</button>
              </div>
            </section>
          )}
        </div>
      </div>

      <WeaponModal busy={game.isBusy} open={!animation.isAnimating && renderedState.tiePending && renderedState.playerChoice === Choice.None} onChoose={choice => perform(() => game.chooseWeapon(choice))} />
    </main>
  );
}

function GameClocks({ state, ownOwner }: { state: GameState; ownOwner: Owner }) {
  const receivedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => { receivedAt.current = Date.now(); setNow(Date.now()); }, [state]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(timer); }, []);
  const remaining = (owner: Owner) => {
    const base = owner === Owner.P0 ? state.clock0Ms ?? 600_000 : state.clock1Ms ?? 600_000;
    return Math.max(0, base - (state.phase === Phase.Active && state.clockRunning === owner ? now - receivedAt.current : 0));
  };
  const opponent = ownOwner === Owner.P0 ? Owner.P1 : Owner.P0;
  return <section className={styles.clocks} aria-label="Game clocks">
    <Clock label="YOU" ms={remaining(ownOwner)} running={state.phase === Phase.Active && state.clockRunning === ownOwner} />
    <Clock label="OPPONENT" ms={remaining(opponent)} running={state.phase === Phase.Active && state.clockRunning === opponent} />
  </section>;
}

function Clock({ label, ms, running }: { label: string; ms: number; running: boolean }) {
  const seconds = Math.ceil(ms / 1000);
  return <div className={`${styles.clock} ${running ? styles.runningClock : ''}`}><span><i /> {label}</span><strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong></div>;
}

function LineupCountdown({ deadlineAt }: { deadlineAt: number }) {
  const [remaining, setRemaining] = useState(Math.max(0, deadlineAt - Date.now()));
  useEffect(() => { const update = () => setRemaining(Math.max(0, deadlineAt - Date.now())); update(); const timer = window.setInterval(update, 250); return () => window.clearInterval(timer); }, [deadlineAt]);
  const seconds = Math.ceil(remaining / 1000);
  return <span className={styles.countdown}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>;
}

function WeaponModal({ open, busy, onChoose }: { open: boolean; busy: boolean; onChoose: (choice: Choice) => void }) {
  if (!open) return null;
  const choices = [[Choice.Rock, 'Rock', '/rock.png'], [Choice.Paper, 'Paper', '/paper.png'], [Choice.Scissors, 'Scissors', '/scissors.png']] as const;
  return <div className={styles.modalBackdrop} role="presentation"><section aria-modal="true" className={styles.modal} role="dialog"><span className={styles.eyebrow}>TIE BREAKER</span><h2>Choose a new weapon</h2><p>Both pieces matched. Your choice stays hidden until both players decide.</p><div className={styles.weaponGrid}>{choices.map(([choice, label, image]) => <button disabled={busy} key={choice} onClick={() => onChoose(choice)}><img alt="" src={image} /><strong>{label}</strong></button>)}</div></section></div>;
}

function JoinGate({ gameId, title, copy, busy = false, onBack, onRetry }: { gameId: string; title: string; copy: string; busy?: boolean; onBack: () => void; onRetry?: () => void }) {
  return <main className={styles.joinGate}><section className={styles.joinCard}><span className={`${styles.joinIcon} ${busy ? styles.spinner : ''}`}>{busy ? '' : '!'}</span><h1>{title}</h1><p>{copy}</p><span className={styles.roomPill}>BATTLE <strong>{gameId}</strong></span>{!busy && <div className={styles.joinActions}>{onRetry && <button className={styles.primaryButton} onClick={onRetry}>Try again</button>}<button onClick={onBack}>Back to home</button></div>}</section></main>;
}

function getStateMessage(state: GameState, hasSubmitted: boolean, isMyTurn: boolean, playerId: string, isComputer = false) {
  if (state.phase < Phase.Active) return hasSubmitted ? 'Lineup saved. You can change it until the battle starts' : 'Use the lineup controls to get ready';
  if (state.phase === Phase.Active) return isMyTurn ? 'Your turn — select a piece' : isComputer ? "Computer's turn" : "Opponent's turn";
  if (state.finishReason === 'lineup_timeout') return 'Game canceled — a lineup was not saved in time';
  if (state.finishReason === 'timeout') return state.winner === playerId ? 'Victory — opponent ran out of time' : 'Time expired — you lost';
  return state.winner === playerId ? 'Victory' : 'Game finished';
}

function lineupFromState(state: GameState, owner: Owner) { return state.owners.flatMap((value, index) => value === owner && state.pieces[index] !== Piece.Empty ? [{ x: index % WIDTH, y: Math.floor(index / WIDTH), piece: state.pieces[index]! }] : []); }
function createRandomLineup(isPlayer0: boolean): LineupPiece[] { const pieces: Piece[] = [Piece.Rock, Piece.Rock, Piece.Rock, Piece.Rock, Piece.Paper, Piece.Paper, Piece.Paper, Piece.Paper, Piece.Scissors, Piece.Scissors, Piece.Scissors, Piece.Scissors, Piece.Flag, Piece.Trap]; const cells = Array.from({ length: WIDTH * 2 }, (_, index) => ({ x: index % WIDTH, y: isPlayer0 ? HEIGHT - 2 + Math.floor(index / WIDTH) : Math.floor(index / WIDTH) })); shuffle(pieces); shuffle(cells); return pieces.map((piece, index) => ({ ...cells[index]!, piece })); }
function shuffle<T>(items: T[]) { for (let index = items.length - 1; index > 0; index -= 1) { const target = Math.floor(Math.random() * (index + 1)); [items[index], items[target]] = [items[target]!, items[index]!]; } }
function normalizeRoomCode(value: string | string[] | undefined) { const raw = Array.isArray(value) ? value[0] : value; return raw?.trim().toLowerCase().replace(/[^a-z0-9]/g, '') ?? ''; }
function same(a: Coordinate, b: Coordinate) { return a.x === b.x && a.y === b.y; }
