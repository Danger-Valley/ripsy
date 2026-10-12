import React from 'react';

export function QuantityPicker({ name, value, maximum, disabled, className, onChange }: {
  name: string; value: number; maximum: number; disabled: boolean; className?: string; onChange(value: number): void;
}) {
  return <div role="group" aria-label={`${name} quantity`} className={className}>
    <span>Quantity</span>
    <button type="button" aria-label={`Fewer ${name} figures`} disabled={disabled || value <= 1} onClick={() => onChange(Math.max(1, value - 1))}>-</button>
    <output aria-label={`${name} quantity, ${value} of ${maximum}`} aria-live="polite">{value}</output>
    <button type="button" aria-label={`More ${name} figures`} disabled={disabled || value >= maximum} onClick={() => onChange(Math.min(maximum, value + 1))}>+</button>
  </div>;
}
