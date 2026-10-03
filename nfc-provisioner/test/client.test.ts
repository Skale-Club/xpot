import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, PROTOCOL_VERSION, ProvisionerApi, normalizeServerUrl } from "../src/api/client";

/** Records requests and answers like the Xpot server (server/tags/routes.ts). */
function fakeFetch(respond: (url: string, init: RequestInit) => { status: number; body?: unknown }) {
  const calls: Array<{ url: string; init: RequestInit; body: unknown }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init!, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const { status, body } = respond(url, init!);
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, impl };
}

test("normalizeServerUrl: https only, except localhost; keeps just the origin", () => {
  assert.equal(normalizeServerUrl(" https://xpot.place/admin/tags "), "https://xpot.place");
  assert.equal(normalizeServerUrl("http://localhost:2110"), "http://localhost:2110");
  assert.throws(() => normalizeServerUrl("http://xpot.place"), /https/);
});

test("sends protocol header, app version and bearer token; 204 claim = no job", async () => {
  const { calls, impl } = fakeFetch((url) => (url.endsWith("/jobs/claim") ? { status: 204 } : { status: 200, body: {} }));
  const api = new ProvisionerApi("https://xpot.place", "0.1.0", "snp_abc", impl);
  assert.equal(await api.claim(), null);
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(calls[0].url, "https://xpot.place/api/provisioner/jobs/claim");
  assert.equal(headers["x-provisioner-protocol"], String(PROTOCOL_VERSION));
  assert.equal(headers["x-provisioner-app-version"], "0.1.0");
  assert.equal(headers.authorization, "Bearer snp_abc");
});

test("pair body matches the server's strict pairSchema", async () => {
  const { calls, impl } = fakeFetch(() => ({
    status: 201,
    body: { token: "snp_new", device: { id: "d1", deviceName: "Workshop PC", status: "active" }, protocolVersion: 1 },
  }));
  const api = new ProvisionerApi("https://xpot.place", "0.1.0", null, impl);
  const res = await api.pair("ABCD-EFGH", "win32-x64");
  assert.equal(res.token, "snp_new");
  assert.equal(res.device.deviceName, "Workshop PC");
  assert.deepEqual(calls[0].body, { pairingCode: "ABCD-EFGH", platform: "win32-x64", appVersion: "0.1.0" });
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, undefined);
});

test("complete trims free text to the server limits instead of losing the result", async () => {
  const { calls, impl } = fakeFetch(() => ({ status: 200, body: { id: "j", status: "failed", errorCode: "write_failed", errorMessage: "x" } }));
  const api = new ProvisionerApi("https://xpot.place", "0.1.0", "snp_abc", impl);
  await api.complete("job-1", { outcome: "failed", errorCode: "write_failed", errorMessage: "e".repeat(900), tagType: "t".repeat(60) });
  const body = calls[0].body as { errorMessage: string; tagType: string };
  assert.equal(body.errorMessage.length, 500);
  assert.equal(body.tagType.length, 40);
  await api.complete("job-1", { outcome: "succeeded", readbackUrl: "https://xpot.place/n/A7K3P9X2", tagType: "NTAG213" });
  assert.deepEqual(calls[1].body, { outcome: "succeeded", readbackUrl: "https://xpot.place/n/A7K3P9X2", tagType: "NTAG213" });
});

test("errors surface the server's { message } and status", async () => {
  const { impl } = fakeFetch((url) =>
    url.endsWith("/session")
      ? { status: 426, body: { message: "This Xpot NFC Writer version is not compatible with the server. Install the current version.", protocolVersion: 2 } }
      : { status: 401, body: { message: "Device is not paired or was revoked" } },
  );
  const api = new ProvisionerApi("https://xpot.place", "0.1.0", "snp_abc", impl);
  await assert.rejects(api.session(), (err: ApiError) => err.updateRequired && /not compatible with the server/.test(err.message));
  await assert.rejects(api.claim(), (err: ApiError) => err.unpaired && err.message === "Device is not paired or was revoked");
});
