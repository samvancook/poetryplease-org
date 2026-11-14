import test from "node:test";
import assert from "node:assert/strict";
import { sniffFormat } from "./diagnose-display-previews.mjs";

test("sniffFormat names a file by its first bytes, not its name", () => {
  assert.equal(sniffFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
  assert.equal(sniffFormat(Buffer.from("\x89PNG\r\n", "latin1")), "png");
  assert.equal(sniffFormat(Buffer.from("\0\0\0\x18ftypheic", "latin1")), "heif(heic)");
  assert.equal(sniffFormat(Buffer.from("\0\0\0\x18ftypavif", "latin1")), "avif");
  assert.equal(sniffFormat(Buffer.from("%PDF-1.7")), "pdf");
  assert.equal(sniffFormat(Buffer.from("8BPS\0\x01")), "psd");
  assert.equal(sniffFormat(Buffer.from("<!DOCTYPE html><html>")), "html");
  assert.equal(sniffFormat(Buffer.alloc(0)), "empty");
});
