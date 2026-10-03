import test from "node:test";
import assert from "node:assert/strict";
import { decodeUriFromMessage, encodeUriRecord, findNdefMessage, wrapNdefTlv } from "../src/nfc/ndef";
import { SimulatedReaderAdapter, blankNtagMemory } from "../src/nfc/reader";
import { TagError, bytesForUri, readNdefUri, readTagInfo, writeNdefUri } from "../src/nfc/type2";

const URL = "https://xpot.place/n/A7K3P9X2";

test("URI record uses the https:// prefix code and short-record header", () => {
  const record = encodeUriRecord(URL);
  // D1 = MB|ME|SR|TNF well-known, type length 1, payload length, 'U', 0x04 = https://
  assert.deepEqual([...record.subarray(0, 5)], [0xd1, 0x01, 1 + "xpot.place/n/A7K3P9X2".length, 0x55, 0x04]);
  assert.equal(record.subarray(5).toString("utf8"), "xpot.place/n/A7K3P9X2");
  assert.equal(decodeUriFromMessage(record), URL);
  // Longest prefix wins.
  assert.equal(encodeUriRecord("https://www.example.com")[4], 0x02);
  assert.equal(decodeUriFromMessage(encodeUriRecord("https://www.example.com/x")), "https://www.example.com/x");
});

test("TLV wrapping and parsing, skipping NULL and Lock Control TLVs", () => {
  const tlv = wrapNdefTlv(encodeUriRecord(URL));
  assert.equal(tlv[0], 0x03);
  assert.equal(tlv[tlv.length - 1], 0xfe);
  const withPrefixTlvs = Buffer.concat([Buffer.from([0x00, 0x01, 0x03, 0xa0, 0x0c, 0x34]), tlv]);
  const found = findNdefMessage(withPrefixTlvs);
  assert.equal(decodeUriFromMessage(found.message!), URL);
  // Truncated data asks for more bytes instead of guessing.
  assert.ok(findNdefMessage(tlv.subarray(0, 8)).needBytes! > 8);
  // Empty NDEF TLV (factory state).
  assert.equal(findNdefMessage(Buffer.from([0x03, 0x00, 0xfe, 0x00])).message!.length, 0);
});

test("tag info: NTAG213/215 sizes, unformatted and read-only tags", async () => {
  const sim = new SimulatedReaderAdapter();
  sim.placeTag(blankNtagMemory(144));
  assert.deepEqual(await readTagInfo(sim.io()), { tagType: "NTAG213", dataAreaBytes: 144, writable: true, ndefVersion: "1.0" });
  sim.placeTag(blankNtagMemory(496));
  assert.equal((await readTagInfo(sim.io())).tagType, "NTAG215");
  sim.placeTag(blankNtagMemory(144, { readOnly: true }));
  assert.equal((await readTagInfo(sim.io())).writable, false);
  const locked = blankNtagMemory(144);
  locked[11] = 0xff; // static lock bits for pages 8–15
  sim.placeTag(locked);
  assert.equal((await readTagInfo(sim.io())).writable, false);
  sim.placeTag(blankNtagMemory(144, { formatted: false }));
  await assert.rejects(readTagInfo(sim.io()), (e: unknown) => e instanceof TagError && e.code === "unsupported_tag");
});

test("write → read back returns exactly the URL; rewrites replace older longer URLs", async () => {
  const sim = new SimulatedReaderAdapter();
  sim.placeTag(blankNtagMemory(144));
  const info = await readTagInfo(sim.io());
  assert.equal(await readNdefUri(sim.io(), info), null);
  const long = "https://xpot.place/n/A7K3P9X2?with=a-much-longer-query-string-that-spans-many-pages";
  await writeNdefUri(sim.io(), info, long);
  assert.equal(await readNdefUri(sim.io(), info), long);
  await writeNdefUri(sim.io(), info, URL);
  assert.equal(await readNdefUri(sim.io(), info), URL);
  // Page 4 is written twice: first with length 0, last with the real length.
  sim.placeTag(blankNtagMemory(144));
  await writeNdefUri(sim.io(), info, URL);
  assert.equal(sim.writes, bytesForUri(URL).length / 4 + 1);
});

test("lifting the tag mid-write leaves it empty, never a truncated URL", async () => {
  const sim = new SimulatedReaderAdapter();
  const memory = blankNtagMemory(144);
  sim.placeTag(memory);
  const info = await readTagInfo(sim.io());
  sim.removeAfterWrites = 3;
  await assert.rejects(writeNdefUri(sim.io(), info, URL), (e: unknown) => e instanceof TagError && e.code === "tag_removed");
  sim.removeAfterWrites = null;
  sim.placeTag(memory); // same chip back on the reader
  assert.equal(await readNdefUri(sim.io(), info), null);
});

test("read-only and too-small tags are refused before writing", async () => {
  const sim = new SimulatedReaderAdapter();
  sim.placeTag(blankNtagMemory(144, { readOnly: true }));
  await assert.rejects(writeNdefUri(sim.io(), await readTagInfo(sim.io()), URL), (e: unknown) => e instanceof TagError && e.code === "tag_read_only");
  assert.equal(sim.writes, 0);
  sim.placeTag(blankNtagMemory(24));
  const tiny = await readTagInfo(sim.io());
  await assert.rejects(writeNdefUri(sim.io(), tiny, URL), (e: unknown) => e instanceof TagError && e.code === "insufficient_capacity");
});
