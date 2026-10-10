/** Deliberately safe, customer-facing errors (never RPC payloads or secrets). */
import type { TokenShortfall } from '@rps/core/shop';
export class ShopError extends Error {
  constructor(message: string, public status = 400, public recovery?: TokenShortfall) { super(message); }
}
