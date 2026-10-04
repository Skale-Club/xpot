// HTTP client for the Xpot provisioning API (/api/provisioner/*).
// Wire contract mirrors shared/tagProvisioning.ts and server/tags/routes.ts in
// this repo; bump PROTOCOL_VERSION together with the server's
// PROVISIONER_PROTOCOL_VERSION. The app ships separately, so it keeps its own
// copy of the constants instead of importing them.

export const PROTOCOL_VERSION = 1;

/** Server-side field limits (completeSchema in server/tags/routes.ts). */
const MAX_ERROR_MESSAGE = 500;
const MAX_TAG_TYPE = 40;

export interface ProvisioningJob {
  id: string;
  tagId: string;
  publicCode: string;
  productType: string;
  expectedUrl: string;
  status: string;
  expiresAt: string;
}

export type DeviceEventType =
  | "reader_connected"
  | "reader_disconnected"
  | "tag_detected"
  | "write_started"
  | "write_completed"
  | "verification_passed"
  | "verification_failed"
  | "error";

export type ErrorCode =
  | "no_reader"
  | "multiple_readers"
  | "unsupported_reader"
  | "no_tag"
  | "unsupported_tag"
  | "tag_read_only"
  | "insufficient_capacity"
  | "write_failed"
  | "tag_removed"
  | "verification_mismatch"
  | "cancelled_by_operator"
  | "expired"
  | "internal_error";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
  get unpaired() {
    return this.status === 401;
  }
  get updateRequired() {
    return this.status === 426;
  }
}

/** Only https, except a local server during development. */
export function normalizeServerUrl(input: string): string {
  const url = new URL(input.trim());
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("Server must be an https:// address");
  }
  return url.origin;
}

export class ProvisionerApi {
  constructor(
    private serverUrl: string,
    private appVersion: string,
    private token: string | null = null,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  setToken(token: string | null) {
    this.token = token;
  }

  get origin() {
    return this.serverUrl;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T | null }> {
    const headers: Record<string, string> = {
      "x-provisioner-protocol": String(PROTOCOL_VERSION),
      "x-provisioner-app-version": this.appVersion,
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.serverUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new ApiError(0, `Cannot reach ${this.serverUrl} (${(err as Error).message})`);
    }
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!res.ok) {
      const message = (data as { message?: string } | null)?.message ?? `Server error ${res.status}`;
      throw new ApiError(res.status, message);
    }
    return { status: res.status, data: data as T };
  }

  async pair(pairingCode: string, platform: string) {
    const { data } = await this.request<{ token: string; device: { id: string; deviceName: string } }>(
      "POST",
      "/api/provisioner/pair",
      { pairingCode, platform, appVersion: this.appVersion },
    );
    return data!;
  }

  async session() {
    const { data } = await this.request<{ device: { id: string; deviceName: string }; protocolVersion: number; baseUrl: string }>(
      "GET",
      "/api/provisioner/session",
    );
    return data!;
  }

  /** The job to work on, or null when there is none. */
  async claim(): Promise<ProvisioningJob | null> {
    const { status, data } = await this.request<ProvisioningJob>("POST", "/api/provisioner/jobs/claim", {});
    return status === 204 ? null : data;
  }

  async event(type: DeviceEventType, jobId?: string | null, detail?: Record<string, string | number | boolean | null>) {
    await this.request("POST", "/api/provisioner/events", { type, jobId: jobId ?? null, ...(detail ? { detail } : {}) });
  }

  async complete(
    jobId: string,
    report: { outcome: "succeeded" | "failed"; readbackUrl?: string | null; tagType?: string | null; errorCode?: ErrorCode; errorMessage?: string },
  ) {
    // Over-long free text would be rejected (400) and lose the result; trim it.
    const body = {
      ...report,
      tagType: report.tagType?.slice(0, MAX_TAG_TYPE) ?? report.tagType,
      errorMessage: report.errorMessage?.slice(0, MAX_ERROR_MESSAGE),
    };
    const { data } = await this.request<{ id: string; status: string; errorCode: string | null; errorMessage: string | null }>(
      "POST",
      `/api/provisioner/jobs/${encodeURIComponent(jobId)}/complete`,
      body,
    );
    return data!;
  }
}
