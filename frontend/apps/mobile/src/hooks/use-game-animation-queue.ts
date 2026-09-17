import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import type { GameState } from '@rps/core';
import {
  classifyGameTransition,
  COMBAT_WINNER_SETTLE_MS,
  combatAttackDurationMs,
  gameStateFingerprint,
  getCombatAnimation,
  getPieceMoveAnimation,
  getTrapAnimation,
  pieceMoveDurationMs,
  REPEATED_TIE_REVEAL_MS,
  RIVE_TRAP_DURATION_MS,
  type CombatAnimation,
  type CombatAnimationPhase,
  type GameAnimationKind,
  type PieceMoveAnimation,
  type TrapAnimation,
} from '../game-animation';

type TrapTrigger = 'Trap Activate' | 'Fall In Trap';

interface QueuedTransition {
  kind: GameAnimationKind;
  combat: CombatAnimation | null;
  move: PieceMoveAnimation | null;
  trap: TrapAnimation | null;
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
  const pendingMoveStartRef = useRef<((travelDelayMs?: number) => void) | null>(null);
  const pendingMoveFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLandingReadyRef = useRef<(() => void) | null>(null);
  const pendingLandingFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTrapStartRef = useRef<((trigger?: TrapTrigger) => void) | null>(null);
  const pendingTrapFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const drainRef = useRef<() => void>(() => undefined);
  const [displayedState, setDisplayedState] = useState<GameState | null>(null);
  const [activeKind, setActiveKind] = useState<GameAnimationKind | null>(null);
  const [activeMove, setActiveMove] = useState<PieceMoveAnimation | null>(null);
  const [activeCombat, setActiveCombat] = useState<CombatAnimation | null>(null);
  const [combatPhase, setCombatPhase] = useState<CombatAnimationPhase | null>(null);
  const [activeTrap, setActiveTrap] = useState<TrapAnimation | null>(null);
  const [activeTrapSequence, setActiveTrapSequence] = useState(0);

  const startProgressTiming = (
    duration: number,
    toValue: number,
    easing: ((value: number) => number) | undefined,
    onComplete: () => void,
    deferUntilNextTurn = true,
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
    const start = () => {
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
    };
    if (deferUntilNextTurn) startTimer = setTimeout(start, 0);
    else start();
  };

  const startPresentationDelay = (duration: number, onComplete: () => void) => {
    activeTimingCancelRef.current?.();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (activeTimingCancelRef.current === cancel) activeTimingCancelRef.current = null;
      if (mountedRef.current) onComplete();
    }, duration);
    const cancel = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (activeTimingCancelRef.current === cancel) activeTimingCancelRef.current = null;
    };
    activeTimingCancelRef.current = cancel;
  };

  const startActiveMove = useCallback((travelDelayMs = 0) => {
    pendingMoveStartRef.current?.(travelDelayMs);
  }, []);

  const completeActiveMoveLanding = useCallback(() => {
    pendingLandingReadyRef.current?.();
  }, []);

  const startActiveTrap = useCallback((trigger: TrapTrigger) => {
    pendingTrapStartRef.current?.(trigger);
  }, []);

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
    if (pendingMoveFallbackRef.current !== null) clearTimeout(pendingMoveFallbackRef.current);
    pendingMoveFallbackRef.current = null;
    pendingMoveStartRef.current = null;
    if (pendingLandingFallbackRef.current !== null) clearTimeout(pendingLandingFallbackRef.current);
    pendingLandingFallbackRef.current = null;
    pendingLandingReadyRef.current = null;
    if (pendingTrapFallbackRef.current !== null) clearTimeout(pendingTrapFallbackRef.current);
    pendingTrapFallbackRef.current = null;
    pendingTrapStartRef.current = null;
    const resumesPendingCombat = Boolean(
      transition.combat?.resolution === 'resolved'
      && activeCombatRef.current?.resolution === 'pending',
    );
    const revealsRepeatedTie = Boolean(
      transition.combat?.resolution === 'pending'
      && transition.combat.isRepeatedTie
      && activeCombatRef.current?.resolution === 'pending',
    );
    setActiveKind(transition.kind);
    setActiveMove(transition.move);
    setActiveCombat(transition.combat);
    setActiveTrap(transition.trap);
    if (transition.trap) setActiveTrapSequence(sequence => sequence + 1);
    activeCombatRef.current = transition.combat;
    setCombatPhase(transition.combat ? (resumesPendingCombat ? 'attack' : revealsRepeatedTie ? 'hold' : 'prepare') : null);
    progress.setValue(resumesPendingCombat || revealsRepeatedTie ? 1.35 : 0);

    const completeTransition = () => {
      runningRef.current = false;
      setActiveKind(null);
      setActiveMove(null);
      setActiveCombat(null);
      setActiveTrap(null);
      activeCombatRef.current = null;
      setCombatPhase(null);
      drainRef.current();
    };

    if (transition.trap) {
      const triggered = new Set<TrapTrigger>();
      let started = false;
      // The authoritative board keeps the trap mounted in its destination;
      // the removed attacker is rendered as a temporary overlay above it.
      displayedRef.current = transition.state;
      setDisplayedState(transition.state);

      const startTrapTimeline = (trigger?: TrapTrigger) => {
        if (trigger) triggered.add(trigger);
        if (trigger && triggered.size < 2) return;
        if (started) return;
        started = true;
        pendingTrapStartRef.current = null;
        if (pendingTrapFallbackRef.current !== null) clearTimeout(pendingTrapFallbackRef.current);
        pendingTrapFallbackRef.current = null;
        startPresentationDelay(RIVE_TRAP_DURATION_MS, completeTransition);
      };

      pendingTrapStartRef.current = startTrapTimeline;
      // Never leave gameplay blocked if a native Rive callback is lost.
      pendingTrapFallbackRef.current = setTimeout(() => startTrapTimeline(), 750);
      return;
    }

    if (transition.combat) {
      const combat = transition.combat;
      if (combat.resolution === 'pending') {
        if (revealsRepeatedTie) {
          startPresentationDelay(REPEATED_TIE_REVEAL_MS, () => {
            displayedRef.current = transition.state;
            setDisplayedState(transition.state);
            runningRef.current = false;
            setActiveKind(null);
            setCombatPhase('hold');
            drainRef.current();
          });
          return;
        }
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
            setCombatPhase('settle');
            startProgressTiming(COMBAT_WINNER_SETTLE_MS, 4, Easing.inOut(Easing.cubic), () => {
              runningRef.current = false;
              activeCombatRef.current = null;
              setActiveKind(null);
              setActiveMove(null);
              setActiveCombat(null);
              setActiveTrap(null);
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

    const finishMove = () => {
      displayedRef.current = transition.state;
      setDisplayedState(transition.state);
      if (!transition.move) {
        startProgressTiming(transition.kind === 'battle' ? 260 : 160, 2, undefined, completeTransition);
        return;
      }

      let destinationReady = false;
      let minimumSettleElapsed = false;
      let completed = false;
      const finishLanding = () => {
        if (completed || !destinationReady || !minimumSettleElapsed) return;
        completed = true;
        pendingLandingReadyRef.current = null;
        if (pendingLandingFallbackRef.current !== null) clearTimeout(pendingLandingFallbackRef.current);
        pendingLandingFallbackRef.current = null;
        completeTransition();
      };
      pendingLandingReadyRef.current = () => {
        destinationReady = true;
        finishLanding();
      };
      // Keep the translated source instance visible while the destination Rive
      // instance initializes invisibly beneath it. The fallback prevents a
      // missing native readiness callback from blocking the turn forever.
      pendingLandingFallbackRef.current = setTimeout(() => {
        destinationReady = true;
        minimumSettleElapsed = true;
        finishLanding();
      }, 1_500);
      startProgressTiming(140, 2, undefined, () => {
        minimumSettleElapsed = true;
        finishLanding();
      });
    };

    if (transition.move) {
      let started = false;
      const beginMove = (requestedTravelDelayMs = 0) => {
        if (started || !mountedRef.current || pendingMoveStartRef.current !== beginMove) return;
        started = true;
        pendingMoveStartRef.current = null;
        if (pendingMoveFallbackRef.current !== null) clearTimeout(pendingMoveFallbackRef.current);
        pendingMoveFallbackRef.current = null;
        const fullJumpDurationMs = pieceMoveDurationMs(transition.move!);
        const travelDelayMs = Math.max(0, Math.min(requestedTravelDelayMs, fullJumpDurationMs - 1));
        const startTravel = () => {
          pendingMoveFallbackRef.current = null;
          if (!mountedRef.current) return;
          startProgressTiming(
            fullJumpDurationMs - travelDelayMs,
            1,
            Easing.bezier(0.22, 0.75, 0.25, 1),
            finishMove,
            false,
          );
        };
        // Figures hold their board position for the authored takeoff before
        // container travel begins, while still landing at the end of the same
        // Rive jump timeline.
        if (travelDelayMs > 0) pendingMoveFallbackRef.current = setTimeout(startTravel, travelDelayMs);
        else startTravel();
      };
      pendingMoveStartRef.current = beginMove;
      // Do not deadlock gameplay if a platform never supplies a Rive ref.
      // Normal movement starts from RiveGamePiece's trigger callback instead.
      pendingMoveFallbackRef.current = setTimeout(beginMove, 1_500);
      return;
    }

    startProgressTiming(120, 1, Easing.linear, finishMove);
  };

  useEffect(() => {
    if (!authoritativeState) return;
    const fingerprint = gameStateFingerprint(authoritativeState);
    if (fingerprint === latestFingerprintRef.current) return;
    latestFingerprintRef.current = fingerprint;

    if (!displayedRef.current || displayedRef.current.gameId !== authoritativeState.gameId) {
      activeTimingCancelRef.current?.();
      if (pendingMoveFallbackRef.current !== null) clearTimeout(pendingMoveFallbackRef.current);
      pendingMoveFallbackRef.current = null;
      pendingMoveStartRef.current = null;
      if (pendingLandingFallbackRef.current !== null) clearTimeout(pendingLandingFallbackRef.current);
      pendingLandingFallbackRef.current = null;
      pendingLandingReadyRef.current = null;
      if (pendingTrapFallbackRef.current !== null) clearTimeout(pendingTrapFallbackRef.current);
      pendingTrapFallbackRef.current = null;
      pendingTrapStartRef.current = null;
      progress.stopAnimation();
      progress.setValue(0);
      queueRef.current = [];
      runningRef.current = false;
      activeCombatRef.current = null;
      setActiveKind(null);
      setActiveMove(null);
      setActiveCombat(null);
      setActiveTrap(null);
      setCombatPhase(null);
      displayedRef.current = authoritativeState;
      latestStateRef.current = authoritativeState;
      setDisplayedState(authoritativeState);
      return;
    }

    const baseline = latestStateRef.current ?? displayedRef.current;
    const trap = getTrapAnimation(baseline, authoritativeState);
    const combat = trap ? null : getCombatAnimation(baseline, authoritativeState);
    queueRef.current.push({
      kind: classifyGameTransition(baseline, authoritativeState),
      combat,
      move: combat || trap ? null : getPieceMoveAnimation(baseline, authoritativeState),
      trap,
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
      if (pendingMoveFallbackRef.current !== null) clearTimeout(pendingMoveFallbackRef.current);
      pendingMoveFallbackRef.current = null;
      pendingMoveStartRef.current = null;
      if (pendingLandingFallbackRef.current !== null) clearTimeout(pendingLandingFallbackRef.current);
      pendingLandingFallbackRef.current = null;
      pendingLandingReadyRef.current = null;
      if (pendingTrapFallbackRef.current !== null) clearTimeout(pendingTrapFallbackRef.current);
      pendingTrapFallbackRef.current = null;
      pendingTrapStartRef.current = null;
      progress.stopAnimation();
    };
  }, [progress]);

  return {
    displayedState,
    activeKind,
    activeMove,
    activeCombat,
    combatPhase,
    activeTrap,
    activeTrapSequence,
    isAnimating: activeKind !== null,
    progress,
    startActiveMove,
    startActiveTrap,
    completeActiveMoveLanding,
    opacity: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 0.55, 1] }),
    scale: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 1.025, 1] }),
  };
}
