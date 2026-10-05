"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Phase, Piece, toIdx, WIDTH, HEIGHT, type GameState } from '@rps/core';
import { usePlayerIdentity, useRipsyGame } from '@rps/game-client';
import { toast } from 'sonner';
import { WalletCard } from './components/WalletCard';
import styles from './page.module.css';

const LAST_GAME_KEY = 'ripsy.last-game.v1';

export default function HomePage() {
  const router = useRouter();
  const { playerId } = usePlayerIdentity();
  const game = useRipsyGame();
  const [roomCode, setRoomCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [gamesLoaded, setGamesLoaded] = useState(false);

  useEffect(() => {
    if (!game.isConnected) {
      setGamesLoaded(false);
      return;
    }
    game.listGames().then(() => setGamesLoaded(true)).catch(() => undefined);
  }, [game.isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!gamesLoaded) return;
    const savedGameId = localStorage.getItem(LAST_GAME_KEY);
    if (!savedGameId) return;
    const savedGame = game.activeGames.find(candidate => candidate.gameId === savedGameId);
    if (savedGame?.phase !== Phase.Finished) router.push(`/game/${savedGameId}`);
    else localStorage.removeItem(LAST_GAME_KEY);
  }, [game.activeGames, gamesLoaded, router]);

  const activeGames = useMemo(
    () => game.activeGames.filter(candidate => candidate.phase !== Phase.Finished),
    [game.activeGames],
  );

  const openGame = (gameId: string) => {
    localStorage.setItem(LAST_GAME_KEY, gameId);
    router.push(`/game/${gameId}`);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const { gameId } = await game.createGame();
      openGame(gameId);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not create game');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = (event: FormEvent) => {
    event.preventDefault();
    const normalized = roomCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!normalized) return;
    openGame(normalized);
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <span className={styles.heroEyebrow}>RIPSY PLAYGROUND</span>
          <h1>RIPSY</h1>
          <div className={styles.heroStage} aria-hidden>
            <span className={`${styles.fighterBubble} ${styles.fighterBubbleBlue}`}>
              <Image alt="" height={150} priority src="/figures/fig1.png" width={150} />
            </span>
            <span className={styles.vsBadge}>VS</span>
            <span className={`${styles.fighterBubble} ${styles.fighterBubbleCoral}`}>
              <Image alt="" height={150} priority src="/figures/fig2.png" width={150} />
            </span>
          </div>
          <p>Build your army. Outsmart your rival. Grab the flag!</p>
        </header>

        <section className={styles.section} aria-labelledby="active-games-title">
          <div className={styles.sectionHeading}>
            <span>
              <span className={styles.eyebrow}>BACK TO THE PLAY TABLE</span>
              <h2 id="active-games-title">Your active games</h2>
            </span>
            <span className={styles.countBadge}>{activeGames.length}</span>
          </div>
          {activeGames.length > 0 ? (
            <div className={styles.gameCarousel}>
              {activeGames.map(candidate => (
                <button className={styles.gameCard} key={candidate.gameId} onClick={() => openGame(candidate.gameId)}>
                  <MiniBoard state={candidate} playerId={playerId} />
                  <span className={styles.gameCardCopy}>
                    <span className={styles.eyebrow}>BATTLE {candidate.gameId}</span>
                    <strong>{gameTitle(candidate, playerId)}</strong>
                    <span>{gameSubtitle(candidate)}</span>
                  </span>
                  <span className={styles.chevron} aria-hidden>›</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.emptyGames}>
              <span className={styles.emptyCount}>0</span>
              <span><strong>No battles in progress</strong><small>Your next rivalry starts below.</small></span>
            </div>
          )}
        </section>

        <section className={`${styles.section} ${styles.battleCard}`}>
          <div className={styles.cardHeading}>
            <span className={styles.cardIcon}>VS</span>
            <span><span className={styles.eyebrow}>CHOOSE YOUR MATCH</span><h2>Start a battle</h2></span>
          </div>
          <button className={styles.primaryButton} disabled={!game.isConnected || creating} onClick={handleCreate}>
            {creating ? 'Creating battle…' : game.isConnected ? 'Create game' : 'Connecting…'}
          </button>
          <a className={styles.computerButton} href="/computer">Play vs computer</a>
          <form className={styles.joinForm} onSubmit={handleJoin}>
            <label htmlFor="room-code">Have a room code?</label>
            <div className={styles.joinRow}>
              <input id="room-code" autoCapitalize="none" autoComplete="off" maxLength={32} onChange={event => setRoomCode(event.target.value)} placeholder="Enter battle ID" value={roomCode} />
              <button disabled={!roomCode.trim()}>Join</button>
            </div>
          </form>
          {game.error && <p className={styles.inlineError}>{game.error}</p>}
        </section>

        <section className={`${styles.section} ${styles.battleCard}`}>
          <div className={styles.cardHeading}>
            <span className={`${styles.cardIcon} ${styles.cardIconCoral}`}>★</span>
            <span><span className={styles.eyebrow}>THE FIGURE COLLECTION</span><h2>Your next favourite fighter.</h2></span>
          </div>
          <a className={styles.primaryButton} href="/army">Set up your army</a>
          <a className={styles.computerButton} href="/shop">Explore figure shop →</a>
        </section>
        <WalletCard />

        <footer className={styles.footer}>
          <a href="/download">Download Android</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/support">Support</a>
        </footer>
      </div>
    </main>
  );
}

function MiniBoard({ state, playerId }: { state: GameState; playerId: string }) {
  const isPlayer1 = state.p1 === playerId;
  return (
    <span className={styles.miniBoard} aria-hidden>
      {Array.from({ length: WIDTH * HEIGHT }, (_, displayIndex) => {
        const displayX = displayIndex % WIDTH;
        const displayY = Math.floor(displayIndex / WIDTH);
        const x = isPlayer1 ? WIDTH - 1 - displayX : displayX;
        const y = isPlayer1 ? HEIGHT - 1 - displayY : displayY;
        const piece = state.pieces[toIdx(x, y)] ?? Piece.Empty;
        return <i key={displayIndex}>{pieceLetter(piece)}</i>;
      })}
    </span>
  );
}

function pieceLetter(piece: Piece) {
  if (piece === Piece.Rock) return 'R';
  if (piece === Piece.Paper) return 'P';
  if (piece === Piece.Scissors) return 'S';
  if (piece === Piece.Flag) return 'F';
  if (piece === Piece.Trap) return 'T';
  return '';
}

function gameTitle(state: GameState, playerId: string) {
  if (state.phase < Phase.Active) {
    const ownLineupSaved = state.p0 === playerId ? state.phase === Phase.LineupP0Set : state.phase === Phase.LineupP1Set;
    return ownLineupSaved ? 'Waiting for opponent lineup' : 'Set your lineup';
  }
  return state.isP1Turn === (state.p1 === playerId) ? 'Your turn' : "Opponent's turn";
}

function gameSubtitle(state: GameState) {
  const players = state.p1 ? '2 players' : 'waiting for player';
  return `${state.live0 + state.live1} pieces · ${players}`;
}
