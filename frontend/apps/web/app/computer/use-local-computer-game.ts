"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Choice, Owner, Phase, type GameState } from '@rps/core';
import { chooseWeapon, gameView, movePiece, settleGameDeadline, settleGameClock, submitLineup, type GameRecord } from '@rps/game-engine';
import { chooseComputerMove, chooseComputerWeapon, COMPUTER_PLAYER_ID, createComputerGame, LOCAL_PLAYER_ID } from './local-computer-game';

export function useLocalComputerGame(presentationBusy: boolean) {
  const recordRef = useRef<GameRecord | null>(null);
  if (!recordRef.current) recordRef.current = createComputerGame();
  const [gameState, setGameState] = useState<GameState>(() => gameView(recordRef.current!, LOCAL_PLAYER_ID));
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const publish = useCallback(() => { if (recordRef.current) setGameState(gameView(recordRef.current, LOCAL_PLAYER_ID)); }, []);
  const run = useCallback(async (operation: (game: GameRecord) => void) => {
    const record = recordRef.current;
    if (!record) throw new Error('Local game is not ready');
    setIsBusy(true); setError(null);
    try { operation(record); setGameState(gameView(record, LOCAL_PLAYER_ID)); setRevision(value => value + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Local action failed'); throw cause; }
    finally { setIsBusy(false); }
  }, []);

  useEffect(() => { if (gameState.phase === Phase.Finished) return; const timer = window.setInterval(() => { const record = recordRef.current; if (record && settleGameDeadline(record)) publish(); }, 250); return () => window.clearInterval(timer); }, [gameState.phase, publish]);
  useEffect(() => {
    const record = recordRef.current;
    if (!record || record.phase !== Phase.Active || presentationBusy) return;
    const needsChoice = record.tiePending && record.choices[1] === Choice.None;
    const needsMove = record.isP1Turn && !record.tiePending;
    if (!needsChoice && !needsMove) return;
    const timer = window.setTimeout(() => {
      const current = recordRef.current;
      if (!current || current.phase !== Phase.Active) return;
      try {
        if (current.tiePending && current.choices[1] === Choice.None) chooseWeapon(current, COMPUTER_PLAYER_ID, chooseComputerWeapon());
        else if (current.isP1Turn && !current.tiePending) {
          const move = chooseComputerMove(current);
          if (move) movePiece(current, COMPUTER_PLAYER_ID, move.fromX, move.fromY, move.toX, move.toY);
          else { current.clock1Ms = 0; settleGameClock(current); }
        }
        publish();
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Computer move failed'); }
    }, 550 + Math.floor(Math.random() * 650));
    return () => window.clearTimeout(timer);
  }, [gameState.isP1Turn, gameState.phase, gameState.playerChoice, gameState.tiePending, gameState.tieRound, presentationBusy, publish, revision]);

  return useMemo(() => ({ gameState, error, isBusy, isPlayer0: true, isPlayer1: false, ownOwner: Owner.P0, isMyTurn: gameState.phase === Phase.Active && !gameState.isP1Turn, joinGame: async () => undefined, refresh: async () => gameState, submitCustomLineup: (xs: number[], ys: number[], pieces: number[], figureVariants?: number[], _figureAssetIds?: Array<string | null>) => run(record => submitLineup(record, LOCAL_PLAYER_ID, xs, ys, pieces, new Date(), figureVariants)), movePiece: (fromX: number, fromY: number, toX: number, toY: number) => run(record => movePiece(record, LOCAL_PLAYER_ID, fromX, fromY, toX, toY)), chooseWeapon: (choice: Choice) => run(record => chooseWeapon(record, LOCAL_PLAYER_ID, choice)) }), [error, gameState, isBusy, run]);
}
