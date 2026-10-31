/** A fresh idempotency key per user intent. Re-sending the same intent (double-click, retry) reuses it. */
export function newIdempotencyKey(scope: string): string {
  return `${scope}-${crypto.randomUUID()}`
}
