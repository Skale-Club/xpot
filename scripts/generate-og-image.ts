import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const input = path.join(root, "scripts", "assets", "og-image-background.png");
const output = path.join(root, "client", "public", "og-image.png");

const overlay = Buffer.from(`
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#05070f" stop-opacity="0.98"/>
      <stop offset="0.48" stop-color="#05070f" stop-opacity="0.82"/>
      <stop offset="0.76" stop-color="#05070f" stop-opacity="0.08"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b82f6"/>
      <stop offset="1" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#shade)"/>
  <rect x="68" y="58" width="58" height="58" rx="16" fill="url(#brand)"/>
  <path d="M86 77 L108 99 M108 77 L86 99" stroke="white" stroke-width="7" stroke-linecap="round"/>
  <text x="143" y="102" fill="white" font-family="Inter, Arial, sans-serif" font-size="43" font-weight="750">Xpot</text>
  <rect x="68" y="158" width="222" height="32" rx="16" fill="#2563eb" fill-opacity="0.16" stroke="#60a5fa" stroke-opacity="0.35"/>
  <text x="86" y="180" fill="#bfdbfe" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700" letter-spacing="2">FIELD SALES · QR/NFC</text>
  <text x="68" y="270" fill="white" font-family="Inter, Arial, sans-serif" font-size="58" font-weight="760" letter-spacing="-1.5">Every visit on record.</text>
  <text x="68" y="337" fill="#a5b4fc" font-family="Inter, Arial, sans-serif" font-size="58" font-weight="760" letter-spacing="-1.5">Every sale in its place.</text>
  <text x="68" y="400" fill="#cbd5e1" font-family="Inter, Arial, sans-serif" font-size="23" font-weight="430">GPS check-ins, AI voice notes, sales, consignment</text>
  <text x="68" y="433" fill="#cbd5e1" font-family="Inter, Arial, sans-serif" font-size="23" font-weight="430">and scan-ready customer pieces — all in one app.</text>
  <text x="68" y="558" fill="#93c5fd" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="650" letter-spacing="0.5">xpot.place</text>
</svg>`);

async function main() {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await sharp(input)
    .resize(1200, 630, { fit: "cover", position: "centre" })
    .composite([{ input: overlay }])
    .png({ compressionLevel: 9, palette: true, quality: 95 })
    .toFile(output);

  console.log(`Generated ${path.relative(root, output)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
