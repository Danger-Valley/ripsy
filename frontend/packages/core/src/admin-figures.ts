import type { FigureDefinition } from '@rps/core/figure-manifest';

export const FIGURE_UPLOAD_LIMITS = { rive: 8 * 1024 * 1024, png: 4 * 1024 * 1024, storage: 64 * 1024 * 1024, draftSeconds: 1800 };
export interface NewFigureInput {
  requestId: string; id: string; name: string; description: string; currency: string; price: string;
  riveBase64: string; pngBase64: string;
}
export interface FigureDraft {
  requestId: string; id: string; name: string; description: string; currency: string; price: string;
  createdAt: number; expiresAt: number; riveBytes: number; pngBytes: number;
  riveSha256: string; pngSha256: string; previewDataUrl: string;
}
export interface AdminRegisteredFigure extends FigureDefinition {
  publishedAt: number; requestId: string;
}
export interface AdminFigures {
  revision: number; draft: FigureDraft | null; published: AdminRegisteredFigure[];
  currencies: Array<{ symbol: string; decimals: number }>;
  usedBytes: number; limits: typeof FIGURE_UPLOAD_LIMITS;
}
