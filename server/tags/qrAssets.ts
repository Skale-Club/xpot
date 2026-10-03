import QRCode from "qrcode";
import sharp from "sharp";
import { zipSync, strToU8 } from "fflate";
import { buildManufacturingCsv, buildTagUrls } from "#shared/tags.js";

// Print-ready QR assets. Plain black-on-white, 4-module quiet zone, no logo,
// error correction M: the encoded URL is short (~30 chars), so the symbol stays
// small enough for a 25–30 mm print while tolerating scuffs.

const QR_OPTIONS = {
  errorCorrectionLevel: "M" as const,
  margin: 4,
  color: { dark: "#000000", light: "#ffffff" },
};

export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: "svg" });
}

/**
 * ~1200 px ≈ 1000+ dpi at 30 mm — plenty for variable-data printing.
 * Rasterised by sharp (libvips, off the event loop) from the module matrix at
 * an integer scale, so every module is the same whole number of pixels.
 * qrcode's own PNG writer is synchronous and ~200 ms per image at this size.
 */
export async function qrPng(url: string, width = 1200): Promise<Buffer> {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: QR_OPTIONS.errorCorrectionLevel });
  const size = modules.size + QR_OPTIONS.margin * 2;
  const pixels = Buffer.alloc(size * size, 255);
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) {
      if (modules.get(y, x)) pixels[(y + QR_OPTIONS.margin) * size + x + QR_OPTIONS.margin] = 0;
    }
  }
  const scale = Math.max(1, Math.floor(width / size));
  return sharp(pixels, { raw: { width: size, height: size, channels: 1 } })
    .resize(size * scale, size * scale, { kernel: "nearest" })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

export interface BatchZipInput {
  batch: { batchCode: string; quantity: number };
  tags: ReadonlyArray<{ publicCode: string; serialNumber: number | null }>;
  baseUrl: string;
  includePng?: boolean;
}

/**
 * ZIP layout:
 *   <batch>/manifest.csv     batch_code, serial_number, public_code, qr_url, nfc_url, qr_asset_filename
 *   <batch>/svg/<CODE>.svg   one QR per tag (encodes the full https QR URL)
 *   <batch>/png/<CODE>.png   optional high-resolution PNG
 */
export async function buildBatchZip({ batch, tags, baseUrl, includePng = false }: BatchZipInput): Promise<Uint8Array> {
  const root = batch.batchCode.replace(/[^A-Za-z0-9._-]/g, "_") || "batch";
  const files: Record<string, Uint8Array> = {
    [`${root}/manifest.csv`]: strToU8(buildManufacturingCsv(batch, tags, baseUrl, "svg")),
  };
  for (const tag of tags) {
    const { qrUrl } = buildTagUrls(baseUrl, tag.publicCode);
    files[`${root}/svg/${tag.publicCode}.svg`] = strToU8(await qrSvg(qrUrl));
  }
  if (includePng) {
    // A few at a time: sharp works on libuv's thread pool, so this overlaps
    // without holding hundreds of rasters in flight.
    for (let i = 0; i < tags.length; i += 8) {
      await Promise.all(tags.slice(i, i + 8).map(async (tag) => {
        const { qrUrl } = buildTagUrls(baseUrl, tag.publicCode);
        files[`${root}/png/${tag.publicCode}.png`] = new Uint8Array(await qrPng(qrUrl));
      }));
    }
  }
  return zipSync(files, { level: 6 });
}
