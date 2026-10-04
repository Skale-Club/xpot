import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, type ProvisionerApi, type ProvisioningJob } from "../src/api/client";
import { Provisioner, type ProvisionerState } from "../src/core/provisioner";
import { MemoryCredentialStore } from "../src/main/credentialStore";
import { SimulatedReaderAdapter, blankNtagMemory } from "../src/nfc/reader";

/** In-memory stand-in for the Xpot API, with the server's verification rule. */
class FakeServer {
  jobs: Array<ProvisioningJob & { readbackUrl?: string | null; errorCode?: string | null }> = [];
  events: Array<{ type: string; jobId: string | null }> = [];
  validToken = "snp_valid";
  revoked = false;
  protocolOk = true;

  addJob(code: string) {
    const job = {
      id: `job-${this.jobs.length + 1}`,
      tagId: `tag-${code}`,
      publicCode: code,
      productType: "google_review_sign",
      expectedUrl: `https://xpot.place/n/${code}`,
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    this.jobs.push(job);
    return job;
  }

  api(token: string | null): ProvisionerApi {
    const check = () => {
      if (!this.protocolOk) throw new ApiError(426, "Update required");
      if (this.revoked || token !== this.validToken) throw new ApiError(401, "Device is not paired or was revoked");
    };
    const open = (s: string) => ["pending", "claimed", "writing", "verifying"].includes(s);
    const fake = {
      setToken: (t: string | null) => { token = t; },
      pair: async (code: string) => {
        if (!this.protocolOk) throw new ApiError(426, "Update required");
        if (code !== "ABCD-EFGH") throw new ApiError(401, "Invalid or expired pairing code");
        return { token: this.validToken, device: { id: "dev-1", deviceName: "Workshop PC" } };
      },
      session: async () => { check(); return { device: { id: "dev-1", deviceName: "Workshop PC" }, protocolVersion: 1, baseUrl: "https://xpot.place" }; },
      claim: async () => {
        check();
        const held = this.jobs.find((j) => ["claimed", "writing", "verifying"].includes(j.status));
        if (held) return held;
        const next = this.jobs.find((j) => j.status === "pending");
        if (!next) return null;
        next.status = "claimed";
        return next;
      },
      event: async (type: string, jobId?: string | null) => {
        check();
        this.events.push({ type, jobId: jobId ?? null });
        const job = this.jobs.find((j) => j.id === jobId);
        if (job && type === "write_started") job.status = "writing";
        if (job && type === "write_completed") job.status = "verifying";
      },
      complete: async (jobId: string, report: { outcome: string; readbackUrl?: string | null; errorCode?: string }) => {
        check();
        const job = this.jobs.find((j) => j.id === jobId);
        if (!job || !open(job.status)) throw new ApiError(409, "Job is already closed");
        const ok = report.outcome === "succeeded" && report.readbackUrl === job.expectedUrl;
        job.status = ok ? "succeeded" : "failed";
        job.readbackUrl = report.readbackUrl;
        job.errorCode = ok ? null : report.outcome === "succeeded" ? "verification_mismatch" : report.errorCode;
        return { id: job.id, status: job.status, errorCode: job.errorCode ?? null, errorMessage: ok ? null : `failed: ${job.errorCode}` };
      },
    };
    return fake as unknown as ProvisionerApi;
  }
}

async function until(p: Provisioner, cond: (s: ProvisionerState) => boolean, label: string, ms = 3000) {
  const start = Date.now();
  while (!cond(p.state)) {
    if (Date.now() - start > ms) throw new Error(`timeout waiting for: ${label} (state ${JSON.stringify(p.state)})`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

function setup(opts: { paired?: boolean } = {}) {
  const server = new FakeServer();
  const reader = new SimulatedReaderAdapter();
  const store = new MemoryCredentialStore();
  if (opts.paired) store.value = { serverUrl: "https://xpot.place", token: server.validToken, deviceName: "Workshop PC" };
  const p = new Provisioner({
    reader,
    store,
    appVersion: "0.1.0",
    platform: "test",
    pollMs: 20,
    apiFactory: (_url, _v, token) => server.api(token),
  });
  p.start();
  return { server, reader, store, p };
}

test("pair → claim → place tag → program → server-verified → remove → next job", async (t) => {
  const { server, reader, store, p } = setup();
  t.after(() => p.stop());
  assert.equal(p.state.connection, "unpaired");
  await assert.rejects(p.pair("https://xpot.place", "WRONG-CODE"));
  assert.equal(p.state.connection, "unpaired");
  await assert.rejects(p.pair("http://xpot.place", "ABCD-EFGH"), /https/);

  await p.pair("https://xpot.place", "ABCD-EFGH");
  assert.equal(store.value?.token, server.validToken);
  await until(p, (s) => s.connection === "online", "online");
  await until(p, (s) => s.reader.status === "ready", "reader");

  server.addJob("A7K3P9X2");
  await until(p, (s) => s.job?.publicCode === "A7K3P9X2", "job claimed");
  assert.equal(p.canProgram(), "Place the tag on the reader");

  const memory = blankNtagMemory(144);
  reader.placeTag(memory);
  await p.settled();
  assert.equal(p.state.tag.tagType, "NTAG213");
  assert.equal(p.canProgram(), null);

  await p.program();
  assert.equal(p.state.phase, "success");
  assert.equal(p.state.result?.ok, true);
  assert.equal(server.jobs[0].status, "succeeded");
  assert.equal(server.jobs[0].readbackUrl, "https://xpot.place/n/A7K3P9X2");
  assert.deepEqual(server.events.filter((e) => e.jobId === "job-1").map((e) => e.type), ["tag_detected", "write_started", "write_completed"]);

  // Next job waits until the finished piece is lifted.
  server.addJob("B8M4Q0Y3");
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(p.state.job?.publicCode, "A7K3P9X2");
  reader.removeTag();
  await until(p, (s) => s.job?.publicCode === "B8M4Q0Y3", "next job");
});

test("a bad write is reported and the server marks it failed", async (t) => {
  const { server, reader, p } = setup({ paired: true });
  t.after(() => p.stop());
  await until(p, (s) => s.connection === "online", "online");
  server.addJob("A7K3P9X2");
  await until(p, (s) => !!s.job, "job");
  reader.corruptPage = 6; // flips a byte inside the URL
  reader.placeTag(blankNtagMemory(144));
  await p.settled();
  await p.program();
  assert.equal(p.state.phase, "failed");
  assert.equal(server.jobs[0].status, "failed");
  assert.equal(server.jobs[0].errorCode, "verification_mismatch");
});

test("lifting the tag mid-write fails the job as tag_removed", async (t) => {
  const { server, reader, p } = setup({ paired: true });
  t.after(() => p.stop());
  await until(p, (s) => s.connection === "online", "online");
  server.addJob("A7K3P9X2");
  await until(p, (s) => !!s.job, "job");
  reader.placeTag(blankNtagMemory(144));
  await p.settled();
  reader.removeAfterWrites = 2;
  await p.program();
  assert.equal(server.jobs[0].status, "failed");
  assert.equal(server.jobs[0].errorCode, "tag_removed");
  // Tag already gone: the app goes back to waiting for the next job.
  await until(p, (s) => s.phase === "waiting_job", "waiting");
  assert.equal(p.state.result?.ok, false);
});

test("problems found before writing keep the job open", async (t) => {
  const { server, reader, p } = setup({ paired: true });
  t.after(() => p.stop());
  await until(p, (s) => s.connection === "online", "online");
  server.addJob("A7K3P9X2");
  await until(p, (s) => !!s.job, "job");
  reader.placeTag(blankNtagMemory(144, { readOnly: true }));
  await p.settled();
  assert.match(p.canProgram()!, /read-only/);
  await assert.rejects(p.program(), /read-only/);
  reader.placeTag(blankNtagMemory(144, { formatted: false }));
  await p.settled();
  assert.match(p.canProgram()!, /Unsupported tag/);
  assert.equal(server.jobs[0].status, "claimed");
  assert.equal(reader.writes, 0);
});

test("two readers block programming", async (t) => {
  const { server, reader, p } = setup({ paired: true });
  t.after(() => p.stop());
  await until(p, (s) => s.connection === "online", "online");
  server.addJob("A7K3P9X2");
  await until(p, (s) => !!s.job, "job");
  reader.setReaders(["ACR122U A", "ACR122U B"]);
  reader.placeTag(blankNtagMemory(144));
  await p.settled();
  assert.match(p.canProgram()!, /More than one reader/);
});

test("revoked token → unpaired and credentials wiped; protocol mismatch → update required", async (t) => {
  const a = setup({ paired: true });
  t.after(() => a.p.stop());
  await until(a.p, (s) => s.connection === "online", "online");
  a.server.revoked = true;
  a.server.addJob("A7K3P9X2");
  await until(a.p, (s) => s.connection === "unpaired", "unpaired");
  assert.equal(a.store.value, null);

  const b = setup({ paired: true });
  t.after(() => b.p.stop());
  b.server.protocolOk = false;
  b.p.refresh();
  await until(b.p, (s) => s.connection === "update_required", "update required");
});

test("operator can give up on a piece", async (t) => {
  const { server, p } = setup({ paired: true });
  t.after(() => p.stop());
  await until(p, (s) => s.connection === "online", "online");
  server.addJob("A7K3P9X2");
  await until(p, (s) => !!s.job, "job");
  await p.giveUp();
  assert.equal(server.jobs[0].status, "failed");
  assert.equal(server.jobs[0].errorCode, "cancelled_by_operator");
  assert.equal(p.state.job, null);
});
