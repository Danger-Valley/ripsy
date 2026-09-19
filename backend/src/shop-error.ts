/** Deliberately safe, customer-facing errors (never RPC payloads or secrets). */
export class ShopError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
