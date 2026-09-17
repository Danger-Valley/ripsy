"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState } from '@rps/core';
import {
  COMBAT_WINNER_SETTLE_MS,
  REPEATED_TIE_REVEAL_MS,
  RIVE_JUMP_TRAVEL_DELAY_MS,
  RIVE_TRAP_DURATION_MS,
  classifyGameTransition,
  combatAttackDurationMs,
  gameStateFingerprint,
  getCombatAnimation,
  getPieceMoveAnimation,
  getTrapAnimation,
  pieceMoveDurationMs,
  type CombatAnimation,
  type CombatAnimationPhase,
  type GameAnimationKind,
  type PieceMoveAnimation,
  type TrapAnimation,
} from './game-animation';

type MovePhase = 'takeoff' | 'travel' | 'landing';
type TrapTrigger = 'Trap Activate' | 'Fall In Trap';
type QueuedTransition = { kind: GameAnimationKind; combat: CombatAnimation | null; move: PieceMoveAnimation | null; trap: TrapAnimation | null; state: GameState };

export function useWebAnimationQueue(authoritativeState: GameState | null) {
  const displayedRef = useRef<GameState | null>(null);
  const latestRef = useRef<GameState | null>(null);
  const fingerprintRef = useRef<string | null>(null);
  const queueRef = useRef<QueuedTransition[]>([]);
  const runningRef = useRef(false);
  const activeCombatRef = useRef<CombatAnimation | null>(null);
  const timersRef = useRef<number[]>([]);
  const startMoveRef = useRef<(() => void) | null>(null);
  const startTrapRef = useRef<((trigger?: TrapTrigger) => void) | null>(null);
  const drainRef = useRef<() => void>(() => undefined);
  const [displayedState, setDisplayedState] = useState<GameState | null>(null);
  const [activeKind, setActiveKind] = useState<GameAnimationKind | null>(null);
  const [activeMove, setActiveMove] = useState<PieceMoveAnimation | null>(null);
  const [movePhase, setMovePhase] = useState<MovePhase | null>(null);
  const [activeCombat, setActiveCombat] = useState<CombatAnimation | null>(null);
  const [combatPhase, setCombatPhase] = useState<CombatAnimationPhase | null>(null);
  const [activeTrap, setActiveTrap] = useState<TrapAnimation | null>(null);
  const [activeTrapSequence, setActiveTrapSequence] = useState(0);

  const later = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter(value => value !== timer);
      callback();
    }, delay);
    timersRef.current.push(timer);
  };

  const finish = (state: GameState) => {
    displayedRef.current = state;
    setDisplayedState(state);
    runningRef.current = false;
    setActiveKind(null);
    setActiveMove(null);
    setMovePhase(null);
    setActiveCombat(null);
    setCombatPhase(null);
    setActiveTrap(null);
    startTrapRef.current = null;
    activeCombatRef.current = null;
    drainRef.current();
  };

  drainRef.current = () => {
    if (runningRef.current) return;
    const transition = queueRef.current.shift();
    if (!transition) return;

    if (transition.state.tiePending && !transition.combat && activeCombatRef.current?.resolution === 'pending') {
      displayedRef.current = transition.state;
      setDisplayedState(transition.state);
      drainRef.current();
      return;
    }

    if (transition.kind === 'phase' && !transition.combat && !transition.move && !transition.trap) {
      displayedRef.current = transition.state;
      setDisplayedState(transition.state);
      drainRef.current();
      return;
    }

    runningRef.current = true;
    setActiveKind(transition.kind);
    const resumesCombat = transition.combat?.resolution === 'resolved' && activeCombatRef.current?.resolution === 'pending';
    const repeatedTie = transition.combat?.resolution === 'pending' && transition.combat.isRepeatedTie && activeCombatRef.current?.resolution === 'pending';

    if (transition.trap) {
      const triggered = new Set<TrapTrigger>();
      let started = false;
      displayedRef.current = transition.state;
      setDisplayedState(transition.state);
      setActiveTrap(transition.trap);
      setActiveTrapSequence(sequence => sequence + 1);
      const start = (trigger?: TrapTrigger) => {
        if (trigger) triggered.add(trigger);
        if (trigger && triggered.size < 2) return;
        if (started) return;
        started = true;
        startTrapRef.current = null;
        later(() => finish(transition.state), RIVE_TRAP_DURATION_MS);
      };
      startTrapRef.current = start;
      later(() => start(), 750);
      return;
    }

    if (transition.combat) {
      const combat = transition.combat;
      setActiveCombat(combat);
      activeCombatRef.current = combat;
      if (combat.resolution === 'pending') {
        if (repeatedTie) {
          setCombatPhase('hold');
          later(() => {
            displayedRef.current = transition.state;
            setDisplayedState(transition.state);
            runningRef.current = false;
            setActiveKind(null);
            drainRef.current();
          }, REPEATED_TIE_REVEAL_MS);
          return;
        }
        setCombatPhase('prepare');
        later(() => {
          displayedRef.current = transition.state;
          setDisplayedState(transition.state);
          runningRef.current = false;
          setActiveKind(null);
          setCombatPhase('hold');
          drainRef.current();
        }, 620);
        return;
      }

      const attack = () => {
        setCombatPhase('attack');
        later(() => {
          setCombatPhase('death');
          later(() => {
            displayedRef.current = transition.state;
            setDisplayedState(transition.state);
            setCombatPhase('settle');
            later(() => finish(transition.state), COMBAT_WINNER_SETTLE_MS);
          }, 200);
        }, combatAttackDurationMs(combat.winnerPiece) + 100);
      };
      if (resumesCombat) attack();
      else {
        setCombatPhase('prepare');
        later(attack, 400);
      }
      return;
    }

    if (transition.move) {
      const move = transition.move;
      setActiveMove(move);
      setMovePhase('takeoff');
      let started = false;
      const start = () => {
        if (started) return;
        started = true;
        later(() => {
          setMovePhase('travel');
          const travelMs = Math.max(1, pieceMoveDurationMs(move) - RIVE_JUMP_TRAVEL_DELAY_MS);
          later(() => {
            displayedRef.current = transition.state;
            setDisplayedState(transition.state);
            setMovePhase('landing');
            later(() => finish(transition.state), 140);
          }, travelMs);
        }, RIVE_JUMP_TRAVEL_DELAY_MS);
      };
      startMoveRef.current = start;
      later(start, 500);
      return;
    }

    later(() => finish(transition.state), 120);
  };

  useEffect(() => {
    if (!authoritativeState) return;
    const fingerprint = gameStateFingerprint(authoritativeState);
    if (fingerprintRef.current === fingerprint) return;
    fingerprintRef.current = fingerprint;
    if (!displayedRef.current || displayedRef.current.gameId !== authoritativeState.gameId) {
      displayedRef.current = authoritativeState;
      latestRef.current = authoritativeState;
      setDisplayedState(authoritativeState);
      return;
    }
    const baseline = latestRef.current ?? displayedRef.current;
    const trap = getTrapAnimation(baseline, authoritativeState);
    const combat = trap ? null : getCombatAnimation(baseline, authoritativeState);
    queueRef.current.push({ kind: classifyGameTransition(baseline, authoritativeState), combat, move: combat || trap ? null : getPieceMoveAnimation(baseline, authoritativeState), trap, state: authoritativeState });
    latestRef.current = authoritativeState;
    if (navigator.vibrate && baseline.isP1Turn !== authoritativeState.isP1Turn) navigator.vibrate(12);
    drainRef.current();
  }, [authoritativeState]);

  useEffect(() => () => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
    startTrapRef.current = null;
  }, []);

  const startActiveMove = useCallback(() => startMoveRef.current?.(), []);
  const startActiveTrap = useCallback((trigger: TrapTrigger) => startTrapRef.current?.(trigger), []);
  return { displayedState, activeKind, activeMove, movePhase, activeCombat, combatPhase, activeTrap, activeTrapSequence, isAnimating: activeKind !== null, startActiveMove, startActiveTrap };
}
