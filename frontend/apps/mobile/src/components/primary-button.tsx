import type { PropsWithChildren } from 'react';
import { ToyHomeButton } from './toy-home-controls';

type Props = PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'reward';
  accessibilityLabel?: string;
  accessibilityHint?: string;
}>;

/** Compatibility entry point: all remaining actions use the same molded controls. */
export function PrimaryButton({ variant = 'primary', ...props }: Props) {
  const tone = variant === 'secondary' ? 'white' : variant === 'danger' ? 'coral' : 'yellow';
  return <ToyHomeButton compact tone={tone} {...props} />;
}
