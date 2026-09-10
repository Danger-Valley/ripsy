import { HapticFeedbackTypes, trigger } from 'react-native-haptic-feedback';

const options = {
  enableVibrateFallback: false,
  ignoreAndroidSystemSettings: false,
};

function play(type: HapticFeedbackTypes) {
  try {
    trigger(type, options);
  } catch {
    // Haptics are presentation only and must never block a game action.
  }
}

export const haptics = {
  select: () => play(HapticFeedbackTypes.selection),
  move: () => play(HapticFeedbackTypes.impactLight),
  success: () => play(HapticFeedbackTypes.notificationSuccess),
  warning: () => play(HapticFeedbackTypes.notificationWarning),
} as const;
