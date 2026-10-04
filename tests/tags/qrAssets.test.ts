import { test } from "vitest";
import assert from "node:assert/strict";
import sharp from "sharp";
import jsQR from "jsqr";
import { unzipSync, strFromU8 } from "fflate";
import { buildBatchZip, qrPng, qrSvg } from "../../server/tags/qrAssets.js";

async function decode(image: Buffer): Promise<string | null> {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height)?.data ?? null;
}

test("PNG QR decodes to the exact QR URL", async () => {
  const url = "https://xpot.place/q/A7K3P9X2";
  assert.equal(await decode(await qrPng(url, 400)), url);
});

test("SVG QR is plain black on white and decodes to the exact QR URL", async () => {
  const url = "https://xpot.place/q/B8M4Q0Y3";
  const svg = await qrSvg(url);
  assert.match(svg, /^<svg/);
  assert.doesNotMatch(svg, /<image/); // no embedded logo
  assert.equal(await decode(await sharp(Buffer.from(svg), { density: 300 }).png().toBuffer()), url);
});

test("batch ZIP holds a manifest plus one QR per tag, each encoding its own code", async () => {
  const tags = [
    { publicCode: "A7K3P9X2", serialNumber: 1 },
    { publicCode: "B8M4Q0Y3", serialNumber: 2 },
    { publicCode: "C9N5R1Z4", serialNumber: 3 },
  ];
  const zip = unzipSync(await buildBatchZip({
    batch: { batchCode: "REV-2026-001", quantity: 3 },
    tags,
    baseUrl: "https://xpot.place",
    includePng: true,
  }));
  const manifest = strFromU8(zip["REV-2026-001/manifest.csv"]).trim().split("\r\n");
  assert.equal(manifest.length, 4);
  assert.equal(manifest[1], "REV-2026-001,001,A7K3P9X2,https://xpot.place/q/A7K3P9X2,https://xpot.place/n/A7K3P9X2,A7K3P9X2.svg");
  for (const { publicCode } of tags) {
    assert.ok(zip[`REV-2026-001/svg/${publicCode}.svg`], `svg for ${publicCode}`);
    const png = Buffer.from(zip[`REV-2026-001/png/${publicCode}.png`]);
    assert.equal(await decode(png), `https://xpot.place/q/${publicCode}`);
  }
});
