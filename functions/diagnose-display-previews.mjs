// Read-only diagnosis of graphics whose display preview could not be built.
// Reads JSON lines from status?list=stalled-details, downloads each original
// (nothing is written anywhere), and groups them by what the file really is,
// so each cause can be fixed or reported. Run from the functions folder:
//   node diagnose-display-previews.mjs stalled.jsonl
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { DISPLAY_PREVIEW_MAX_SOURCE_BYTES } from "./display-preview.js";

// What the first bytes say the file is, independent of its name.
export function sniffFormat(buffer) {
  const b = buffer.subarray(0, 64);
  const ascii = b.toString("latin1");
  if (b.length === 0) return "empty";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (ascii.startsWith("\x89PNG")) return "png";
  if (ascii.startsWith("GIF8")) return "gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "webp";
  if (ascii.startsWith("%PDF")) return "pdf";
  if (ascii.startsWith("8BPS")) return "psd";
  if (ascii.startsWith("BM")) return "bmp";
  if (ascii.startsWith("II*\0") || ascii.startsWith("MM\0*")) return "tiff";
  if (ascii.slice(4, 8) === "ftyp") {
    const brand = ascii.slice(8, 12).trim();
    if (["avif", "avis"].includes(brand)) return "avif";
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return `heif(${brand})`;
    return `mp4-family(${brand})`;
  }
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return "ico";
  const text = ascii.trimStart().toLowerCase();
  if (text.startsWith("<svg") || (text.startsWith("<?xml") && buffer.toString("utf8", 0, 2048).includes("<svg"))) return "svg";
  if (text.startsWith("<!doctype html") || text.startsWith("<html")) return "html";
  if (text.startsWith("{") || text.startsWith("[")) return "json";
  return `unknown(${b.subarray(0, 8).toString("hex")})`;
}

async function inspect(row) {
  const out = { id: row.id, error: row.error, imageType: row.imageType };
  try {
    const response = await fetch(row.imageUrl, { signal: AbortSignal.timeout(60_000) });
    out.http = response.status;
    out.contentType = response.headers.get("content-type") || "";
    if (!response.ok) return out;
    const buffer = Buffer.from(await response.arrayBuffer());
    out.bytes = buffer.length;
    out.format = sniffFormat(buffer);
    out.tooLarge = buffer.length > DISPLAY_PREVIEW_MAX_SOURCE_BYTES;
    try {
      const m = await sharp(buffer, { limitInputPixels: false }).metadata();
      Object.assign(out, { sharpFormat: m.format, width: m.width, height: m.height, pages: m.pages || 1,
        megapixels: Math.round(((m.width || 0) * (m.height || 0)) / 1e5) / 10 });
    } catch (err) {
      out.sharpError = String(err?.message || err).slice(0, 120);
    }
  } catch (err) {
    out.fetchError = String(err?.message || err).slice(0, 120);
  }
  return out;
}

function causeOf(r) {
  if (r.fetchError) return `fetch failed: ${r.fetchError}`;
  if (r.http !== 200) return `original returns HTTP ${r.http}`;
  if (r.sharpError) return `${r.format}: sharp cannot read (${r.sharpError})`;
  if (r.tooLarge) return `${r.format}: larger than 20 MB`;
  if (r.megapixels > 100) return `${r.format}: over 100 megapixels`;
  if (r.pages > 1) return `${r.format}: animated / multi-page`;
  return `${r.format}: readable now (${r.error ? "had error" : "never reported"})`;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const rows = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const results = [];
  // A few at a time, to be gentle on Storage.
  for (let i = 0; i < rows.length; i += 6) {
    results.push(...await Promise.all(rows.slice(i, i + 6).map(inspect)));
  }
  const groups = new Map();
  for (const r of results) {
    const key = `${r.error ? r.error.slice(0, 60) : "(never reported)"} => ${causeOf(r)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const summary = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([cause, list]) => ({
    count: list.length, cause,
    maxBytes: Math.max(0, ...list.map((r) => r.bytes || 0)),
    maxMegapixels: Math.max(0, ...list.map((r) => r.megapixels || 0)),
    samples: list.slice(0, 4).map((r) => r.id),
  }));
  console.log(JSON.stringify({ total: results.length, summary }, null, 1));
  // One compact line per graphic, for anyone who wants the full list.
  for (const r of results) console.log(`ROW ${JSON.stringify({ id: r.id, cause: causeOf(r), bytes: r.bytes, mp: r.megapixels })}`);
}
