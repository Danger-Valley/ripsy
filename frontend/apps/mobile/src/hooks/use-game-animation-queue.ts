import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import type { GameState } from '@rps/core';
import { classifyGameTransition, gameStateFingerprint, getPieceMoveAnimation, type GameAnimationKind, type PieceMoveAnimation } from '../game-animation';

interface QueuedTransition {
  kind: GameAnimationKind;
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
  const mountedRef = useRef(true);
  const drainRef = useRef<() => void>(() => undefined);
  const [displayedState, setDisplayedState] = useState<GameState | null>(null);
  const [activeKind, setActiveKind] = useState<GameAnimationKind | null>(null);
  const [activeMove, setActiveMove] = useState<PieceMoveAnimation | null>(null);

  drainRef.current = () => {
    if (!mountedRef.current || runningRef.current) return;
    const transition = queueRef.current.shift();
    if (!transition) return;

    runningRef.current = true;
    setActiveKind(transition.kind);
    setActiveMove(transition.move);
    progress.setValue(0);
    Animated.timing(progress, {
      duration: transition.move ? (transition.kind === 'battle' ? 560 : 500) : 120,
      toValue: 1,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || !mountedRef.current) return;
      displayedRef.current = transition.state;
      setDisplayedState(transition.state);
      Animated.timing(progress, {
        duration: transition.kind === 'battle' ? 260 : 160,
        toValue: 2,
        useNativeDriver: true,
      }).start(({ finished: settled }) => {
        if (!settled || !mountedRef.current) return;
        runningRef.current = false;
        setActiveKind(null);
        setActiveMove(null);
        drainRef.current();
      });
    });
  };

  useEffect(() => {
    if (!authoritativeState) return;
    const fingerprint = gameStateFingerprint(authoritativeState);
    if (fingerprint === latestFingerprintRef.current) return;
    latestFingerprintRef.current = fingerprint;

    if (!displayedRef.current || displayedRef.current.gameId !== authoritativeState.gameId) {
      progress.stopAnimation();
      progress.setValue(0);
      queueRef.current = [];
      runningRef.current = false;
      setActiveKind(null);
      setActiveMove(null);
      displayedRef.current = authoritativeState;
      latestStateRef.current = authoritativeState;
      setDisplayedState(authoritativeState);
      return;
    }

    const baseline = latestStateRef.current ?? displayedRef.current;
    queueRef.current.push({
      kind: classifyGameTransition(baseline, authoritativeState),
      move: getPieceMoveAnimation(baseline, authoritativeState),
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
      progress.stopAnimation();
    };
  }, [progress]);

  return {
    displayedState,
    activeKind,
    activeMove,
    isAnimating: activeKind !== null,
    progress,
    opacity: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 0.55, 1] }),
    scale: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 1.025, 1] }),
  };
}
