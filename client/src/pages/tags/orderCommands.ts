/** Keep the original revision as well as the key when a response is lost.
 * Refreshing the order must not turn a retry of a receipt into a second receipt. */
export interface OrderCommandAttempt {
  signature: string;
  key: string;
  revision: number;
}
export function retainOrderCommand(
  previous: OrderCommandAttempt | null,
  input: {
    orderId: string;
    action: string;
    body: Record<string, unknown>;
    revision: number;
  },
  createKey: () => string,
): OrderCommandAttempt {
  const signature = JSON.stringify({
    orderId: input.orderId,
    action: input.action,
    body: input.body,
  });
  return previous?.signature === signature
    ? previous
    : { signature, key: createKey(), revision: input.revision };
}
