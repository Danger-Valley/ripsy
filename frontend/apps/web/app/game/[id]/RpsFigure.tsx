"use client";

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRive } from '@rive-app/react-canvas';

export enum Weapon {
  None = 0,
  Stone = 1,
  Paper = 2,
  Scissors = 3,
  Flag = 4,
  Trap = 5,
}

export type TriggerName =
  | 'Jump Forward'
  | 'Jump Left'
  | 'Jump Right'
  | 'Attack Prepare'
  | 'Attack'
  | 'Trap Activate'
  | 'Fall In Trap'
  | 'Death';

interface Props {
  weapon: Weapon;
  trigger?: TriggerName;
  style?: CSSProperties;
  isMyFigure: boolean;
  staggerStart?: boolean;
  preserveStateOnWeaponChange?: boolean;
  onActionTriggered?: (trigger: TriggerName) => void;
  riveFile?: unknown;
}

export default function RpsFigure({ weapon, trigger, style, isMyFigure, staggerStart = false, preserveStateOnWeaponChange = false, onActionTriggered, riveFile }: Props) {
  const stateMachine = isMyFigure ? 'State Machine Back' : 'State Machine Front';
  const initialDelay = useRef(60 + Math.floor(Math.random() * 340)).current;
  const lastTrigger = useRef<TriggerName | null>(null);
  const trapStateInitialized = useRef(false);
  const [shouldMount, setShouldMount] = useState(!staggerStart);
  const [configured, setConfigured] = useState(false);
  const { rive, RiveComponent } = useRive({
    src: riveFile ? undefined : '/figures/fig1.riv',
    riveFile: riveFile as never,
    autoplay: true,
    stateMachines: [stateMachine],
  }, { useOffscreenRenderer: false });

  useEffect(() => {
    if (!staggerStart) { setShouldMount(true); return; }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) { setShouldMount(true); return; }
    const timer = window.setTimeout(() => setShouldMount(true), initialDelay);
    return () => window.clearTimeout(timer);
  }, [initialDelay, staggerStart]);

  useEffect(() => {
    if (!rive || !shouldMount) return;
    const inputs = rive.stateMachineInputs?.(stateMachine) ?? [];
    const isTrap = weapon === Weapon.Trap;
    const weaponInput = inputs.find(input => input.name === 'Weapon' && 'value' in input);
    if (weaponInput && 'value' in weaponInput) weaponInput.value = isTrap ? Weapon.None : weapon;
    const visibleInput = inputs.find(input => input.name === 'WeaponVisible' && 'value' in input);
    if (visibleInput && 'value' in visibleInput) visibleInput.value = weapon !== Weapon.None && !isTrap;
    if (!isTrap) trapStateInitialized.current = false;
    if (isTrap && !trapStateInitialized.current && trigger !== 'Trap Activate') {
      const initialTrapTrigger = inputs.find(input => input.name === (isMyFigure ? 'Trap Idle' : 'Trap Activate') && typeof input.fire === 'function');
      initialTrapTrigger?.fire?.();
      trapStateInitialized.current = Boolean(initialTrapTrigger);
    }
    requestAnimationFrame(() => setConfigured(true));
  }, [isMyFigure, preserveStateOnWeaponChange, rive, shouldMount, stateMachine, trigger, weapon]);

  useEffect(() => {
    if (!rive || !trigger || !configured || lastTrigger.current === trigger) return;
    lastTrigger.current = trigger;
    const inputs = rive.stateMachineInputs?.(stateMachine) ?? [];
    const triggerInput = inputs.find(input => input.name === trigger && typeof input.fire === 'function');
    triggerInput?.fire?.();
    if (trigger === 'Trap Activate' && triggerInput) trapStateInitialized.current = true;
    onActionTriggered?.(trigger);
  }, [configured, onActionTriggered, rive, stateMachine, trigger]);

  useEffect(() => {
    if (!trigger) lastTrigger.current = null;
  }, [trigger]);

  if (!shouldMount) return null;
  const transform = [style?.transform, !isMyFigure ? 'scaleX(-1)' : undefined].filter(Boolean).join(' ') || undefined;
  return <RiveComponent style={{ ...style, opacity: configured ? 1 : 0, transform }} />;
}
