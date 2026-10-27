import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

interface PreviewNavigation {
  isFocused?(): boolean;
  addListener?(event: 'focus' | 'blur', listener: () => void): () => void;
}

/** Fail closed to a portrait until the OS motion preference is known. */
export function useShopPreviewMotion(navigation: PreviewNavigation) {
  const [focused, setFocused] = useState(() => navigation.isFocused?.() !== false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  useEffect(() => {
    setFocused(navigation.isFocused?.() !== false);
    const focus = navigation.addListener?.('focus', () => setFocused(true));
    const blur = navigation.addListener?.('blur', () => setFocused(false));
    return () => { focus?.(); blur?.(); };
  }, [navigation]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    let current = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      setReducedMotion(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (current && !changed) setReducedMotion(value);
    }).catch(() => undefined);
    return () => { current = false; subscription.remove(); };
  }, []);
  return focused && appState === 'active' && reducedMotion === false;
}

/** Update React only when visible IDs change, not on every scroll frame. */
export function useShopPreviewViewport() {
  const cards = useRef(new Map<string, { y: number; height: number }>());
  const viewport = useRef({ offset: 0, height: 0 });
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const update = useCallback(() => {
    const { offset, height } = viewport.current;
    const next = [...cards.current].filter(([, bounds]) => height > 0 && bounds.y < offset + height
      && bounds.y + bounds.height > offset).map(([id]) => id).sort();
    setVisibleIds(current => current.join('\0') === next.join('\0') ? current : next);
  }, []);
  const onViewportLayout = useCallback((event: LayoutChangeEvent) => {
    viewport.current.height = event.nativeEvent.layout.height;
    update();
  }, [update]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    viewport.current.offset = Math.max(0, event.nativeEvent.contentOffset.y);
    update();
  }, [update]);
  const onCardLayout = useCallback((id: string, event: LayoutChangeEvent, previewHeight: number) => {
    // Card wrappers are direct children of the ScrollView content container.
    // Only their top showcase animates; visible purchase controls alone do not.
    cards.current.set(id, { y: event.nativeEvent.layout.y, height: previewHeight });
    update();
  }, [update]);
  return { visibleIds, onViewportLayout, onScroll, onCardLayout };
}
