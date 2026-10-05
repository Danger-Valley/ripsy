/** Minimal type surface for the pinned pure qrcode 1.5.4 encoder. */
declare module 'qrcode/lib/core/qrcode.js' {
  export function create(segments: Array<{ data: Uint8Array; mode: 'byte' }>, options: { errorCorrectionLevel: 'M' }): {
    modules: { size: number; data: Uint8Array };
  };
}
