import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import type { GameState } from '@rps/core';
import {
  classifyGameTransition,
  combatAttackDurationMs,
  gameStateFingerprint,
  getCombatAnimation,
  getPieceMoveAnimation,
  pieceMoveDurationMs,
  type CombatAnimation,
  type CombatAnimationPhase,
  type GameAnimationKind,
  type PieceMoveAnimation,
} from '../game-animation';

interface QueuedTransition {
  kind: GameAnimationKind;
  combat: CombatAnimation | null;
  move: PieceMoveAnimation | null;
  state: GameState;
}

export function useGameAnimationQueue(authoritativeState: GameState | null) {
  const progress = useRef(new Animated.Value(0)).current;
  const displayedRef = useRef<GameState | null>(null);
  const latestStateRef = useRef<GameState | null>(null);
  const latestFingerprintRef = useRef<string | null>(null);
  const queueRef = useRef<QueuedTransition[]>([]);
  const runningRef = useRef(false);
  const activeCombatRef = useRef<CombatAnimation | null>(null);
  const activeTimingCancelRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const drainRef = useRef<() => void>(() => undefined);
  const [displayedState, setDisplayedState] = useState<GameState | null>(null);
  const [activeKind, setActiveKind] = useState<GameAnimationKind | null>(null);
  const [activeMove, setActiveMove] = useState<PieceMoveAnimation | null>(null);
  const [activeCombat, setActiveCombat] = useState<CombatAnimation | null>(null);
  const [combatPhase, setCombatPhase] = useState<CombatAnimationPhase | null>(null);

  const startProgressTiming = (
    duration: number,
    toValue: number,
    easing: ((value: number) => number) | undefined,
    onComplete: () => void,
  ) => {
    activeTimingCancelRef.current?.();
    let animation: Animated.CompositeAnimation | null = null;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const clearTimers = () => {
      if (startTimer !== null) clearTimeout(startTimer);
      if (watchdogTimer !== null) clearTimeout(watchdogTimer);
      startTimer = null;
      watchdogTimer = null;
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      clearTimers();
      animation?.stop();
      if (activeTimingCancelRef.current === cancel) activeTimingCancelRef.current = null;
    };
    const finish = (forceEndValue = false) => {
      if (settled) return;
      settled = true;
      clearTimers();
      if (forceEndValue) {
        animation?.stop();
        progress.setValue(toValue);
      }
      if (activeTimingCancelRef.current === cancel) activeTimingCancelRef.current = null;
      if (mountedRef.current) onComplete();
    };

    activeTimingCancelRef.current = cancel;
    // Let React commit the moving Rive view before the native driver starts.
    // Starting in the same render turn can leave the native animation detached
    // on a physical device, so its completion callback never arrives.
    startTimer = setTimeout(() => {
      if (settled || !mountedRef.current) return;
      animation = Animated.timing(progress, {
        duration,
        easing,
        toValue,
        useNativeDriver: true,
      });
      // A canceled native callback must never leave the presentation queue —
      // and therefore the local computer turn — permanently blocked.
      watchdogTimer = setTimeout(() => finish(true), duration + 400);
      animation.start(({ finished }) => finish(!finished));
    }, 0);
  };

  drainRef.current = () => {
    if (!mountedRef.current || runningRef.current) return;
    const transition = queueRef.current.shift();
    if (!transition) return;

    if (transition.state.tiePending && !transition.combat && activeCombatRef.current?.resolution === 'pending') {
      displayedRef.current = transition.state;
      setDisplayedState(transition.state);
      drainRef.current();
      return;
    }

    runningRef.current = true;
    const resumesPendingCombat = Boolean(
      transition.combat?.resolution === 'resolved'
      && activeCombatRef.current?.resolution === 'pending',
    );
    setActiveKind(transition.kind);
    setActiveMove(transition.move);
    setActiveCombat(transition.combat);
    activeCombatRef.current = transition.combat;
    setCombatPhase(transition.combat ? (resumesPendingCombat ? 'attack' : 'prepare') : null);
    progress.setValue(resumesPendingCombat ? 1.35 : 0);

    if (transition.combat) {
      const combat = transition.combat;
      if (combat.resolution === 'pending') {
        startProgressTiming(620, 1.35, Easing.bezier(0.22, 0.72, 0.24, 1), () => {
          displayedRef.current = transition.state;
          setDisplayedState(transition.state);
          runningRef.current = false;
          setActiveKind(null);
          setCombatPhase('hold');
          drainRef.current();
        });
        return;
      }

      const finishAttack = () => {
        setCombatPhase('attack');
        startProgressTiming(combatAttackDurationMs(combat.winnerPiece) + 100, 2, undefined, () => {
          setCombatPhase('death');
          startProgressTiming(200, 3, undefined, () => {
            displayedRef.current = transition.state;
            setDisplayedState(transition.state);
            startProgressTiming(260, 4, undefined, () => {
              runningRef.current = false;
              activeCombatRef.current = null;
              setActiveKind(null);
              setActiveMove(null);
              setActiveCombat(null);
              setCombatPhase(null);
              drainRef.current();
            });
          });
        });
      };

      if (resumesPendingCombat) {
        finishAttack();
        return;
      }

      startProgressTiming(400, 1, undefined, () => {
        finishAttack();
      });
      return;
    }

    startProgressTiming(
      transition.move ? pieceMoveDurationMs(transition.move) : 120,
      1,
      transition.move ? Easing.bezier(0.22, 0.75, 0.25, 1) : Easing.linear,
      () => {
        displayedRef.current = transition.state;
        setDisplayedState(transition.state);
        startProgressTiming(transition.move ? 140 : transition.kind === 'battle' ? 260 : 160, 2, undefined, () => {
          runningRef.current = false;
          setActiveKind(null);
          setActiveMove(null);
          setActiveCombat(null);
          activeCombatRef.current = null;
          setCombatPhase(null);
          drainRef.current();
        });
      },
    );
  };

  useEffect(() => {
    if (!authoritativeState) return;
    const fingerprint = gameStateFingerprint(authoritativeState);
    if (fingerprint === latestFingerprintRef.current) return;
    latestFingerprintRef.current = fingerprint;

    if (!displayedRef.current || displayedRef.current.gameId !== authoritativeState.gameId) {
      activeTimingCancelRef.current?.();
      progress.stopAnimation();
      progress.setValue(0);
      queueRef.current = [];
      runningRef.current = false;
      activeCombatRef.current = null;
      setActiveKind(null);
      setActiveMove(null);
      setActiveCombat(null);
      setCombatPhase(null);
      displayedRef.current = authoritativeState;
      latestStateRef.current = authoritativeState;
      setDisplayedState(authoritativeState);
      return;
    }

    const baseline = latestStateRef.current ?? displayedRef.current;
    const combat = getCombatAnimation(baseline, authoritativeState);
    queueRef.current.push({
      kind: classifyGameTransition(baseline, authoritativeState),
      combat,
      move: combat ? null : getPieceMoveAnimation(baseline, authoritativeState),
      state: authoritativeState,
    });
    latestStateRef.current = authoritativeState;
    drainRef.current();
  }, [authoritativeState, progress]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueRef.current = [];
      activeCombatRef.current = null;
      activeTimingCancelRef.current?.();
      progress.stopAnimation();
    };
  }, [progress]);

  return {
    displayedState,
    activeKind,
    activeMove,
    activeCombat,
    combatPhase,
    isAnimating: activeKind !== null,
    progress,
    opacity: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 0.55, 1] }),
    scale: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 1.025, 1] }),
  };
}
