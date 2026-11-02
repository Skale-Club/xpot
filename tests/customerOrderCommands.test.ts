import { it, expect } from "vitest";
import { retainOrderCommand } from "../client/src/pages/tags/orderCommands.js";
it("a refreshed balance after a lost response retries the same receipt with its original key AND revision", () => {
  let keys = 0;
  const key = () => `key-${++keys}`;
  const operation = {
    orderId: "order-one",
    action: "payments",
    body: { kind: "received", amountCents: 5000 },
    revision: 3,
  };
  const first = retainOrderCommand(null, operation, key);
  const retry = retainOrderCommand(first, { ...operation, revision: 4 }, key);
  expect(retry).toBe(first);
  expect(retry.revision).toBe(3);
  expect(keys).toBe(1);
  expect(
    retainOrderCommand(
      first,
      {
        ...operation,
        body: { kind: "received", amountCents: 2000 },
        revision: 4,
      },
      key,
    ),
  ).toMatchObject({ key: "key-2", revision: 4 });
  expect(
    retainOrderCommand(
      first,
      { ...operation, orderId: "order-two", revision: 7 },
      key,
    ),
  ).toMatchObject({ key: "key-3", revision: 7 });
});
