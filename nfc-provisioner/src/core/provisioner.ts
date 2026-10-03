// Provisioner core: reader + Xpot API + operator, as one state machine.
// No Electron here, so it runs under tests with the simulated reader.
//
// Flow: claim job → place tag → Program → write → read back → report →
// server verifies → Success → remove tag → next job.
// Xpot is the source of truth: no offline writes, no local queue.

import { EventEmitter } from "events";
import { ApiError, ProvisionerApi, normalizeServerUrl, type ErrorCode, type ProvisioningJob } from "../api/client";
import type { ReaderAdapter } from "../nfc/reader";
import { TagError, bytesForUri, readNdefUri, readTagInfo, writeNdefUri, type TagInfo } from "../nfc/type2";

export interface Credentials {
  serverUrl: string;
  token: string;
  deviceName: string;
}

export interface CredentialStore {
  load(): Credentials | null;
  save(credentials: Credentials): void;
  clear(): void;
}

export type Connection = "unpaired" | "connecting" | "online" | "offline" | "update_required";
export type Phase = "waiting_job" | "ready" | "programming" | "verifying" | "success" | "failed";

export interface ProvisionerState {
  appVersion: string;
  connection: Connection;
  connectionMessage: string | null;
  serverUrl: string | null;
  deviceName: string | null;
  reader: { status: "none" | "ready" | "multiple"; names: string[] };
  tag: { present: boolean; tagType: string | null; writable: boolean | null; currentUri: string | null; problem: string | null };
  job: Pick<ProvisioningJob, "id" | "publicCode" | "productType" | "expectedUrl" | "expiresAt"> | null;
  phase: Phase;
  result: { ok: boolean; message: string; readbackUrl?: string | null } | null;
  busy: boolean;
}

export interface ProvisionerOptions {
  reader: ReaderAdapter;
  store: CredentialStore;
  appVersion: string;
  platform: string;
  pollMs?: number;
  apiFactory?: (serverUrl: string, appVersion: string, token: string | null) => ProvisionerApi;
}

const TAG_PROBLEM: Partial<Record<string, string>> = {
  unsupported_tag: "Unsupported tag — use NTAG213/215/216 (NFC Forum Type 2, NDEF-formatted).",
  tag_read_only: "This tag is locked / read-only.",
  insufficient_capacity: "Not enough memory on this tag for the URL.",
};

export class Provisioner extends EventEmitter {
  private opts: Required<Omit<ProvisionerOptions, "apiFactory">> & Pick<ProvisionerOptions, "apiFactory">;
  private api: ProvisionerApi | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private inspecting: Promise<void> | null = null;
  state: ProvisionerState;

  constructor(options: ProvisionerOptions) {
    super();
    this.opts = { pollMs: 3000, ...options };
    this.state = {
      appVersion: options.appVersion,
      connection: "unpaired",
      connectionMessage: null,
      serverUrl: null,
      deviceName: null,
      reader: { status: "none", names: [] },
      tag: { present: false, tagType: null, writable: null, currentUri: null, problem: null },
      job: null,
      phase: "waiting_job",
      result: null,
      busy: false,
    };
  }

  private makeApi(serverUrl: string, token: string | null) {
    return this.opts.apiFactory
      ? this.opts.apiFactory(serverUrl, this.opts.appVersion, token)
      : new ProvisionerApi(serverUrl, this.opts.appVersion, token);
  }

  private set(patch: Partial<ProvisionerState>) {
    this.state = { ...this.state, ...patch };
    this.emit("state", this.state);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  start() {
    const { reader } = this.opts;
    reader.on("readers", (names) => this.onReaders(names));
    reader.on("tag", () => void this.inspectTag());
    reader.on("tag-removed", () => this.onTagRemoved());
    reader.on("error", (err) => this.set({ connectionMessage: `Reader error: ${err.message}` }));
    reader.start();

    const saved = this.opts.store.load();
    if (saved) {
      this.api = this.makeApi(saved.serverUrl, saved.token);
      this.set({ serverUrl: saved.serverUrl, deviceName: saved.deviceName });
      void this.connect();
    }
  }

  stop() {
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.opts.reader.stop();
  }

  /** Waits for in-flight tag inspection (tests). */
  async settled() {
    await this.inspecting;
  }

  async pair(serverUrlInput: string, pairingCode: string) {
    const serverUrl = normalizeServerUrl(serverUrlInput);
    const api = this.makeApi(serverUrl, null);
    this.set({ connection: "connecting", connectionMessage: null });
    try {
      const { token, device } = await api.pair(pairingCode, this.opts.platform);
      this.opts.store.save({ serverUrl, token, deviceName: device.deviceName });
      api.setToken(token);
      this.api = api;
      this.set({ serverUrl, deviceName: device.deviceName });
      await this.connect();
    } catch (err) {
      this.set({
        connection: (err as ApiError).updateRequired ? "update_required" : "unpaired",
        connectionMessage: (err as Error).message,
      });
      throw err;
    }
  }

  unpair() {
    this.opts.store.clear();
    this.api = null;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.set({ connection: "unpaired", connectionMessage: null, deviceName: null, job: null, phase: "waiting_job", result: null });
  }

  private async connect() {
    if (!this.api) return;
    this.set({ connection: "connecting" });
    try {
      const session = await this.api.session();
      this.set({ connection: "online", connectionMessage: null, deviceName: session.device.deviceName });
      if (this.state.reader.names.length) void this.report("reader_connected", null, { readers: this.state.reader.names.join(", ") });
      this.schedulePoll(0);
    } catch (err) {
      this.handleApiError(err);
    }
  }

  private handleApiError(err: unknown) {
    const e = err as ApiError;
    if (e.unpaired) {
      this.opts.store.clear();
      this.api = null;
      this.set({ connection: "unpaired", connectionMessage: "This computer was unpaired or revoked. Pair it again from Xpot Admin → Tags → NFC writers.", job: null, phase: "waiting_job" });
      return;
    }
    if (e.updateRequired) {
      this.set({ connection: "update_required", connectionMessage: e.message });
      return;
    }
    // Network trouble: no offline mode, just retry.
    this.set({ connection: "offline", connectionMessage: e.message });
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => void this.connect(), this.opts.pollMs * 2);
  }

  // ─── Jobs ───────────────────────────────────────────────────────────────────

  private schedulePoll(delay = this.opts.pollMs) {
    if (this.stopped) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => void this.poll(), delay);
  }

  private async poll() {
    if (!this.api || this.state.connection !== "online" || this.state.job) return;
    try {
      const job = await this.api.claim();
      if (job) {
        this.set({
          job: { id: job.id, publicCode: job.publicCode, productType: job.productType, expectedUrl: job.expectedUrl, expiresAt: job.expiresAt },
          phase: "ready",
          result: null,
        });
        if (this.state.tag.present) void this.report("tag_detected", job.id, { tagType: this.state.tag.tagType });
        return;
      }
      this.schedulePoll();
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** Poll right away (e.g. after an admin sends a job). */
  refresh() {
    if (this.state.connection === "online" && !this.state.job) this.schedulePoll(0);
    else if (this.state.connection === "offline") void this.connect();
  }

  private async report(type: Parameters<ProvisionerApi["event"]>[0], jobId: string | null, detail?: Record<string, string | number | boolean | null>) {
    try {
      await this.api?.event(type, jobId, detail);
    } catch {
      // Audit events are best-effort; the job result is what matters.
    }
  }

  /** Back to waiting; the last result stays on screen until the next job arrives. */
  private clearJob() {
    this.set({ job: null, phase: "waiting_job" });
    this.schedulePoll(0);
  }

  // ─── Reader ─────────────────────────────────────────────────────────────────

  private onReaders(names: string[]) {
    const before = this.state.reader.names.length;
    this.set({ reader: { status: names.length === 0 ? "none" : names.length > 1 ? "multiple" : "ready", names } });
    if (this.state.connection === "online") {
      if (names.length && !before) void this.report("reader_connected", null, { readers: names.join(", ") });
      if (!names.length && before) void this.report("reader_disconnected", null);
    }
  }

  private inspectTag() {
    const run = async () => {
      this.set({ tag: { present: true, tagType: null, writable: null, currentUri: null, problem: null } });
      try {
        const io = this.opts.reader.io();
        const info = await readTagInfo(io);
        const currentUri = await readNdefUri(io, info).catch(() => null);
        this.set({ tag: { present: true, tagType: info.tagType, writable: info.writable, currentUri, problem: info.writable ? null : TAG_PROBLEM.tag_read_only! } });
        if (this.state.job) void this.report("tag_detected", this.state.job.id, { tagType: info.tagType });
      } catch (err) {
        if (!this.opts.reader.currentTag()) return;
        const code = err instanceof TagError ? err.code : "unsupported_tag";
        this.set({ tag: { ...this.state.tag, present: true, problem: TAG_PROBLEM[code] ?? (err as Error).message } });
      }
    };
    this.inspecting = run();
    return this.inspecting;
  }

  private onTagRemoved() {
    this.set({ tag: { present: false, tagType: null, writable: null, currentUri: null, problem: null } });
    // "Remove tag → next tag": a finished job is cleared once the piece is lifted.
    if ((this.state.phase === "success" || this.state.phase === "failed") && !this.state.busy) this.clearJob();
  }

  // ─── Programming ────────────────────────────────────────────────────────────

  canProgram(): string | null {
    const s = this.state;
    if (s.connection !== "online") return "Not connected to Xpot";
    if (!s.job) return "No job — send one from the tag page in Xpot Admin";
    if (s.busy) return "Busy";
    if (s.phase !== "ready") return "Remove the tag to continue";
    if (s.reader.status === "none") return "Connect a USB NFC reader";
    if (s.reader.status === "multiple") return "More than one reader connected — keep only one";
    if (!s.tag.present) return "Place the tag on the reader";
    if (s.tag.problem) return s.tag.problem;
    return null;
  }

  /** Write the job URL, read it back, report. The server decides success. */
  async program(): Promise<void> {
    const blocked = this.canProgram();
    if (blocked) throw new Error(blocked);
    const job = this.state.job!;
    const api = this.api!;
    this.set({ busy: true, phase: "programming", result: null });

    let info: TagInfo;
    try {
      const io = this.opts.reader.io();
      info = await readTagInfo(io);
      if (!info.writable) throw new TagError("tag_read_only", TAG_PROBLEM.tag_read_only!);
      if (bytesForUri(job.expectedUrl).length > info.dataAreaBytes) {
        throw new TagError("insufficient_capacity", TAG_PROBLEM.insufficient_capacity!);
      }
    } catch (err) {
      // Nothing written yet: keep the job open so the operator can fix and retry.
      const code = err instanceof TagError ? err.code : "internal_error";
      void this.report("error", job.id, { stage: "precheck", errorCode: code });
      this.set({ busy: false, phase: "ready", result: { ok: false, message: TAG_PROBLEM[code] ?? (err as Error).message } });
      return;
    }

    try {
      await api.event("write_started", job.id, { tagType: info.tagType });
    } catch (err) {
      this.set({ busy: false, phase: "ready", result: { ok: false, message: `Not written: ${(err as Error).message}` } });
      if (err instanceof ApiError && err.status !== 0) this.dropJobOnConflict(err);
      return;
    }

    let readback: string | null = null;
    let failure: { code: ErrorCode; message: string } | null = null;
    try {
      const io = this.opts.reader.io();
      await writeNdefUri(io, info, job.expectedUrl);
      // Awaited so the server sees it before the result (it closes the job).
      await this.report("write_completed", job.id);
      this.set({ phase: "verifying" });
      readback = await readNdefUri(this.opts.reader.io(), info);
      if (readback !== job.expectedUrl) failure = { code: "verification_mismatch", message: `Read back ${readback ?? "nothing"}` };
    } catch (err) {
      const code: ErrorCode = err instanceof TagError ? err.code : "write_failed";
      failure = { code, message: (err as Error).message };
    }

    try {
      const outcome = await api.complete(job.id, failure
        ? { outcome: "failed", readbackUrl: readback, tagType: info.tagType, errorCode: failure.code, errorMessage: failure.message }
        : { outcome: "succeeded", readbackUrl: readback, tagType: info.tagType });
      const ok = outcome.status === "succeeded";
      this.set({
        busy: false,
        phase: ok ? "success" : "failed",
        result: ok
          ? { ok: true, message: `Verified ${job.publicCode}. Remove the tag, then tap it with a phone and scan its QR.`, readbackUrl: readback }
          : { ok: false, message: `${outcome.errorMessage ?? failure?.message ?? "Failed"} — send the tag again from Xpot.`, readbackUrl: readback },
        tag: { ...this.state.tag, currentUri: readback },
      });
      if (!this.opts.reader.currentTag()) this.clearJob();
    } catch (err) {
      // Result not recorded: the job stays claimed; reconnecting resumes it and
      // re-programming writes the same permanent URL.
      this.set({ busy: false, phase: "ready", result: { ok: false, message: `Could not report the result: ${(err as Error).message}. Program again.` } });
      if (err instanceof ApiError && err.status !== 0) this.dropJobOnConflict(err);
    }
  }

  private dropJobOnConflict(err: ApiError) {
    if (err.status === 409 || err.status === 404) {
      this.set({ job: null, phase: "waiting_job", result: { ok: false, message: `${err.message}` } });
      this.schedulePoll(0);
    } else {
      this.handleApiError(err);
    }
  }

  /** Operator gives up on this piece; Xpot shows it as failed. */
  async giveUp() {
    const job = this.state.job;
    if (!job || this.state.busy || !this.api) return;
    try {
      await this.api.complete(job.id, { outcome: "failed", errorCode: "cancelled_by_operator", errorMessage: "Cancelled at the provisioner" });
    } catch {
      // Already closed or expired on the server — drop it locally either way.
    }
    this.clearJob();
  }
}
