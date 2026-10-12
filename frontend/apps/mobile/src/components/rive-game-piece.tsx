import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { Fit, RiveView, useRive, type RiveFile } from '@rive-app/react-native';
import { Piece } from '@rps/core';

interface Props {
  actionTrigger?: RiveActionTrigger;
  file: RiveFile;
  isMine: boolean;
  onActionTriggered?: (trigger: RiveActionTrigger) => void;
  onConfigured?: () => void;
  piece: Piece;
  preserveStateOnPieceChange?: boolean;
  size: number;
  staggerStart?: boolean;
}

export type RiveActionTrigger =
  | 'Jump Forward'
  | 'Jump Right'
  | 'Jump Left'
  | 'Attack Prepare'
  | 'Attack'
  | 'Trap Activate'
  | 'Fall In Trap'
  | 'Death';

const fileInstanceIds = new WeakMap<RiveFile, number>();
let nextFileInstanceId = 0;

// Both figure artboards are 1000 × 1000. Jump poses extend beyond their
// resting square, so reserve native drawing space above AND below it.
// Contain stays width-limited: the artwork's scale and center do not change.
// Keep this viewport constant during idle/jump/landing; resizing only for
// Jump can update the native view mid-trigger and reintroduce flicker.
const viewportVerticalPaddingRatio = 0.25;

export function RiveGamePiece(props: Props) {
  let fileId = fileInstanceIds.get(props.file);
  if (fileId === undefined) {
    fileId = ++nextFileInstanceId;
    fileInstanceIds.set(props.file, fileId);
  }
  // Shuffle can swap fig1/fig2 in an occupied cell without changing Weapon.
  // A file prop update reloads the native model asynchronously, while useRive
  // still exposes the previously ready view. Remount the whole controller,
  // including its readiness/configuration refs, not just the native view.
  // Weapon and action changes on the same asset/facing keep the instance.
  return <ConfiguredRiveGamePiece key={`${fileId}:${props.isMine ? 'back' : 'front'}`} {...props} />;
}

const ConfiguredRiveGamePiece = memo(function RivePieceController({ actionTrigger, file, isMine, onActionTriggered, onConfigured, piece, preserveStateOnPieceChange = false, size, staggerStart = false }: Props) {
  const { riveViewRef: reportedView, setHybridRef: reportedHybridRef } = useRive();
  const stableViewRef = useRef(reportedView);
  if (stableViewRef.current !== reportedView) {
    // Nitro can expose a new JS wrapper for the SAME underlying native view.
    // SDK useRive compares with !==, so using that wrapper directly as an
    // effect dependency hides/resets every figure on a board update.
    let sameNativeView = false;
    try {
      sameNativeView = Boolean(reportedView && stableViewRef.current && reportedView.equals?.(stableViewRef.current));
    } catch {
      // A detached/disposed view is not reusable; configure its replacement.
    }
    if (!sameNativeView) stableViewRef.current = reportedView;
  }
  const riveViewRef = stableViewRef.current;
  const hybridRefCallback = reportedHybridRef.f;
  const setHybridRef = useMemo(() => ({ f: hybridRefCallback }), [hybridRefCallback]);
  const readyRef = useRef<Promise<boolean>>(Promise.resolve(false));
  const configuredStateMachineRef = useRef<string | null>(null);
  const configuredFileRef = useRef<RiveFile | null>(null);
  const configuredViewRef = useRef<typeof riveViewRef>(undefined);
  const configuredPieceRef = useRef<Piece | null>(null);
  const actionRequestRef = useRef(0);
  const lastTriggeredActionRef = useRef<RiveActionTrigger | null>(null);
  // Action changes must not rerun configuration and restart the state machine.
  const actionTriggerRef = useRef(actionTrigger);
  actionTriggerRef.current = actionTrigger;
  const onConfiguredRef = useRef(onConfigured);
  onConfiguredRef.current = onConfigured;
  const initialDelayMs = useRef(60 + Math.floor(Math.random() * 340)).current;
  const [shouldMountRive, setShouldMountRive] = useState(!staggerStart);
  const [isConfigured, setIsConfigured] = useState(false);
  const stateMachineName = isMine ? 'State Machine Back' : 'State Machine Front';

  useEffect(() => {
    if (!staggerStart) {
      setShouldMountRive(true);
      return;
    }
    if (shouldMountRive) return;

    let cancelled = false;
    // Never wait for the native accessibility query before scheduling the
    // opponent formation. On some devices that promise can stay unresolved
    // until the next screen update, leaving every opponent invisible until
    // Save lineup changes staggerStart.
    const mountTimer = setTimeout(() => {
      if (!cancelled) setShouldMountRive(true);
    }, initialDelayMs);

    AccessibilityInfo.isReduceMotionEnabled()
      .then(reduceMotion => {
        if (!cancelled && reduceMotion) {
          clearTimeout(mountTimer);
          setShouldMountRive(true);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      clearTimeout(mountTimer);
    };
  }, [initialDelayMs, shouldMountRive, staggerStart]);

  useEffect(() => {
    if (!shouldMountRive || !riveViewRef) return;
    let cancelled = false;
    const isTrap = piece === Piece.Trap;

    const setPieceInputs = () => {
      // These are required inputs: never reveal the asset's default Scissors
      // pose and report it configured when a native write failed.
      riveViewRef.setNumberInputValue('Weapon', isTrap ? Piece.Empty : piece);
      if (isMine) riveViewRef.setNumberInputValue('WeaponVisible', piece !== Piece.Empty && !isTrap ? 1 : 0);
    };

    const configurePiece = async () => {
      if (cancelled) return false;
      const sameController = configuredStateMachineRef.current === stateMachineName
        && configuredFileRef.current === file
        && configuredViewRef.current === riveViewRef;
      const leavingTrap = configuredPieceRef.current === Piece.Trap && !isTrap;
      if (sameController && (preserveStateOnPieceChange || !leavingTrap)) {
        // Ordinary Shuffle/reveal changes only inputs, never visibility or
        // playback. Held combat must likewise retain its sideways prepare pose.
        setPieceInputs();
        if (isTrap && configuredPieceRef.current !== Piece.Trap && !preserveStateOnPieceChange
          && (isMine || actionTriggerRef.current !== 'Trap Activate')) {
          riveViewRef.triggerInput(isMine ? 'Trap Idle' : 'Trap Activate');
        }
        if (!cancelled) {
          configuredPieceRef.current = piece;
          setIsConfigured(true);
          onConfiguredRef.current?.();
        }
        return !cancelled;
      }
      setIsConfigured(false);
      // The checked-in Android bridge patch creates the selected machine paused
      // on configure/reset and resolves playback promises only after UI work.
      // No speculative play() is needed to create its input instances.
      if (cancelled) return false;
      if (isMine || leavingTrap) {
        await riveViewRef.pause();
        if (cancelled) return false;
        await riveViewRef.reset();
      }
      if (cancelled) return false;
      setPieceInputs();
      await riveViewRef.play();
      if (cancelled) return false;
      // A cold Android view can replace its first state machine during play.
      // Reapply the hidden weapon before exposing the figure in that case.
      setPieceInputs();
      if (isTrap) {
        // A local trap uses its idle state; an opponent trap uses Trap Activate
        // so the revealed destination remains visibly a trap after the
        // temporary collision scene is removed.
        if (isMine || actionTriggerRef.current !== 'Trap Activate') {
          riveViewRef.triggerInput(isMine ? 'Trap Idle' : 'Trap Activate');
        }
      }
      if (!cancelled) {
        configuredStateMachineRef.current = stateMachineName;
        configuredFileRef.current = file;
        configuredViewRef.current = riveViewRef;
        configuredPieceRef.current = piece;
        setIsConfigured(true);
        onConfiguredRef.current?.();
      }
      return !cancelled;
    };

    // A canceled async reset/play still runs natively. Wait for it to finish
    // before configuring the newest shuffle, and skip superseded requests.
    // Otherwise a late reset can erase inputs/pose already set by a newer one.
    readyRef.current = readyRef.current.then(configurePiece).catch(() => {
      // Deliberately omit native error details, weapon values and game data.
      if (!cancelled) {
        configuredViewRef.current = undefined;
        setIsConfigured(false);
        console.warn('Rive figure initialization failed');
      }
      return false;
    });

    return () => {
      cancelled = true;
    };
  }, [file, isMine, piece, preserveStateOnPieceChange, riveViewRef, shouldMountRive, stateMachineName]);

  useEffect(() => {
    const requestId = ++actionRequestRef.current;
    if (!actionTrigger) {
      lastTriggeredActionRef.current = null;
      return;
    }
    if (!shouldMountRive || !riveViewRef || lastTriggeredActionRef.current === actionTrigger) return;
    let cancelled = false;
    readyRef.current.then(configured => {
      if (
        !configured
        || cancelled
        || requestId !== actionRequestRef.current
        || lastTriggeredActionRef.current === actionTrigger
      ) return;
      lastTriggeredActionRef.current = actionTrigger;
      try {
        riveViewRef.triggerInput(actionTrigger);
      } catch {
        // Keep the scene running if an optional asset trigger is unavailable.
      } finally {
        // Container motion starts only after the Rive trigger has actually
        // fired, so an initializing state machine cannot desynchronize them.
        onActionTriggered?.(actionTrigger);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [actionTrigger, onActionTriggered, riveViewRef, shouldMountRive]);

  return (
    <View pointerEvents="none" style={[styles.container, !isMine && styles.opponent, { width: size, height: size }]} testID="rive-piece">
      {shouldMountRive ? (
        <RiveView
          autoPlay={false}
          file={file}
          fit={Fit.Contain}
          hybridRef={setHybridRef}
          key={stateMachineName}
          stateMachineName={stateMachineName}
          style={[
            styles.rive,
            { top: -size * viewportVerticalPaddingRatio, bottom: -size * viewportVerticalPaddingRatio },
            !isConfigured && styles.riveHidden,
          ]}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  opponent: { transform: [{ scaleX: -1 }] },
  rive: { position: 'absolute', left: 0, right: 0 },
  riveHidden: { opacity: 0 },
});
