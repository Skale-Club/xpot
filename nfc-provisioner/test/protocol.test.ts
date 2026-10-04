import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "fs";
import path from "path";
import { PROTOCOL_VERSION } from "../src/api/client";

// While the app lives inside the Xpot repo, catch protocol drift against the
// server's contract. Skipped once the app is split into its own repository.
const shared = path.join(__dirname, "..", "..", "shared", "tagProvisioning.ts");

test("app protocol version matches Xpot's PROVISIONER_PROTOCOL_VERSION", { skip: !existsSync(shared) && "Xpot repo not present" }, async () => {
  const server = (await import(shared)) as { PROVISIONER_PROTOCOL_VERSION: number; PROVISIONER_PROTOCOL_HEADER: string };
  assert.equal(PROTOCOL_VERSION, server.PROVISIONER_PROTOCOL_VERSION);
  assert.equal(server.PROVISIONER_PROTOCOL_HEADER, "x-provisioner-protocol");
});
