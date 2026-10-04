// Renderer: plain DOM, runs sandboxed. Talks only through window.provisioner
// (see main/preload.ts). Untrusted strings are always set via textContent.

interface ViewState {
  appVersion: string;
  connection: "unpaired" | "connecting" | "online" | "offline" | "update_required";
  connectionMessage: string | null;
  serverUrl: string | null;
  deviceName: string | null;
  reader: { status: "none" | "ready" | "multiple"; names: string[] };
  tag: { present: boolean; tagType: string | null; writable: boolean | null; currentUri: string | null; problem: string | null };
  job: { id: string; publicCode: string; productType: string; expectedUrl: string; expiresAt: string } | null;
  phase: "waiting_job" | "ready" | "programming" | "verifying" | "success" | "failed";
  result: { ok: boolean; message: string; readbackUrl?: string | null } | null;
  busy: boolean;
  blocked: string | null;
}

interface Bridge {
  getState(): Promise<ViewState>;
  pair(serverUrl: string, code: string): Promise<{ ok: boolean; message?: string }>;
  unpair(): Promise<unknown>;
  program(): Promise<{ ok: boolean; message?: string }>;
  giveUp(): Promise<unknown>;
  refresh(): Promise<unknown>;
  openWebsite(): Promise<unknown>;
  onState(listener: (state: ViewState) => void): () => void;
}

const bridge = (window as unknown as { provisioner: Bridge }).provisioner;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const PRODUCT: Record<string, string> = {
  google_review_sign: "Google Review sign",
  business_card: "NFC business card",
  keychain: "NFC keychain",
  safety_tag: "Safety tag",
  menu_tag: "Menu tag",
  booking_tag: "Booking tag",
  custom: "Custom",
};

const CONNECTION: Record<ViewState["connection"], string> = {
  unpaired: "Not paired",
  connecting: "Connecting…",
  online: "Connected",
  offline: "Offline — retrying",
  update_required: "Update required",
};

function setText(id: string, text: string, cls?: string) {
  const el = $(id);
  el.textContent = text;
  if (cls !== undefined) el.className = cls;
}

function render(s: ViewState) {
  const conn = $("connection");
  conn.textContent = CONNECTION[s.connection];
  conn.className = `pill ${s.connection}`;

  $("pair-view").hidden = s.connection !== "unpaired";
  $("update-view").hidden = s.connection !== "update_required";
  $("work-view").hidden = !["online", "connecting", "offline"].includes(s.connection);
  $("unpair").hidden = s.connection === "unpaired";
  setText("update-message", s.connectionMessage ?? "");
  setText("device", s.deviceName ? `${s.deviceName} · ${s.serverUrl ?? ""}` : "");
  setText("version", `v${s.appVersion}`);

  const pairError = $("pair-error");
  pairError.hidden = !(s.connection === "unpaired" && s.connectionMessage);
  pairError.textContent = s.connectionMessage ?? "";

  if (s.reader.status === "none") setText("reader", "No reader — plug in the USB reader", "bad");
  else if (s.reader.status === "multiple") setText("reader", `${s.reader.names.length} readers — keep only one`, "warn");
  else setText("reader", s.reader.names[0], "ok");

  if (!s.tag.present) setText("tag", "No tag on the reader", "muted");
  else if (s.tag.problem) setText("tag", s.tag.problem, "bad");
  else setText("tag", `${s.tag.tagType ?? "Reading…"}${s.tag.currentUri ? ` · has ${s.tag.currentUri}` : s.tag.tagType ? " · empty" : ""}`, "ok");

  $("job-empty").hidden = !!s.job;
  $("job-body").hidden = !s.job;
  if (s.job) {
    setText("job-code", s.job.publicCode);
    setText("job-code-2", s.job.publicCode);
    setText("job-product", PRODUCT[s.job.productType] ?? s.job.productType);
    setText("job-url", s.job.expectedUrl);
  }

  const program = $<HTMLButtonElement>("program");
  program.disabled = !!s.blocked;
  program.textContent = s.phase === "programming" ? "Writing…" : s.phase === "verifying" ? "Verifying…" : "Program NFC";
  setText("blocked", s.phase === "ready" || s.phase === "waiting_job" ? s.blocked ?? "" : "");

  const result = $("result");
  result.hidden = !s.result;
  if (s.result) {
    result.className = `result ${s.result.ok ? "ok" : "bad"}`;
    result.textContent = `${s.result.ok ? "✓ " : "✗ "}${s.result.message}`;
  }
  $("give-up").hidden = !s.job || s.busy || s.phase === "success";
}

$("pair-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $<HTMLButtonElement>("pair-btn");
  btn.disabled = true;
  const res = await bridge.pair($<HTMLInputElement>("server").value, $<HTMLInputElement>("code").value);
  btn.disabled = false;
  if (res.ok) $<HTMLInputElement>("code").value = "";
});
$("program").addEventListener("click", () => void bridge.program());
$("give-up").addEventListener("click", () => {
  if (confirm("Give up on this piece? Xpot will show the job as failed.")) void bridge.giveUp();
});
$("refresh").addEventListener("click", () => void bridge.refresh());
$("unpair").addEventListener("click", () => {
  if (confirm("Unpair this computer? You will need a new pairing code.")) void bridge.unpair();
});
$("open-website").addEventListener("click", () => void bridge.openWebsite());

bridge.onState(render);
void bridge.getState().then(render);
