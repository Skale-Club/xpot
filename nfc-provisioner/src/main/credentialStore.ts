import fs from "fs";
import path from "path";
import type { Credentials, CredentialStore } from "../core/provisioner";

interface Crypto {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/**
 * Device token at rest, encrypted with the OS keychain via Electron
 * safeStorage (Keychain on macOS, DPAPI on Windows, libsecret on Linux).
 * Refuses to store the token in plain text when no OS encryption exists.
 */
export class SafeCredentialStore implements CredentialStore {
  private file: string;

  constructor(dir: string, private crypto: Crypto) {
    this.file = path.join(dir, "device.json");
  }

  load(): Credentials | null {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as { serverUrl: string; deviceName: string; token: string };
      if (!this.crypto.isEncryptionAvailable()) return null;
      const token = this.crypto.decryptString(Buffer.from(raw.token, "base64"));
      return { serverUrl: raw.serverUrl, deviceName: raw.deviceName, token };
    } catch {
      return null;
    }
  }

  save(c: Credentials) {
    if (!this.crypto.isEncryptionAvailable()) {
      throw new Error("OS credential encryption is not available on this computer; cannot store the device token safely.");
    }
    const payload = {
      serverUrl: c.serverUrl,
      deviceName: c.deviceName,
      token: this.crypto.encryptString(c.token).toString("base64"),
    };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(payload), { mode: 0o600 });
  }

  clear() {
    try {
      fs.unlinkSync(this.file);
    } catch {
      // already gone
    }
  }
}

/** In-memory store for tests and the simulator. */
export class MemoryCredentialStore implements CredentialStore {
  value: Credentials | null = null;
  load() {
    return this.value;
  }
  save(c: Credentials) {
    this.value = c;
  }
  clear() {
    this.value = null;
  }
}
