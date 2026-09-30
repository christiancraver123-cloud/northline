// Deterministic image file inspection (format, dimensions, integrity). This reads file STRUCTURE only — it does not judge image
// content, so it can support technical checks but never counts as a visual identity inspection.
import { createHash } from "node:crypto";

export interface ImageInfo { ok: boolean; mime: "image/png" | "image/jpeg" | "image/webp" | null; ext: "png" | "jpg" | "webp" | null; width: number | null; height: number | null; bytes: number; sha256: string; problems: string[] }
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function inspectImage(b: Uint8Array): ImageInfo {
  const buf = Buffer.from(b);
  const out: ImageInfo = { ok: false, mime: null, ext: null, width: null, height: null, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), problems: [] };
  if (buf.length === 0) { out.problems.push("empty file"); return out; }
  if (buf.length > MAX_IMAGE_BYTES) out.problems.push(`file larger than ${MAX_IMAGE_BYTES / 1024 / 1024}MB`);
  if (buf.length > 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && buf.subarray(12, 16).toString() === "IHDR") {
    Object.assign(out, { mime: "image/png", ext: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });
  } else if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2; // scan for a SOFn marker
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) { Object.assign(out, { mime: "image/jpeg", ext: "jpg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }); break; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    if (!out.mime) out.problems.push("JPEG has no frame header (truncated/corrupt)");
  } else if (buf.length > 30 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") {
    const fmt = buf.subarray(12, 16).toString();
    out.mime = "image/webp"; out.ext = "webp";
    if (fmt === "VP8X") { out.width = 1 + buf.readUIntLE(24, 3); out.height = 1 + buf.readUIntLE(27, 3); }
    else if (fmt === "VP8 ") { out.width = buf.readUInt16LE(26) & 0x3fff; out.height = buf.readUInt16LE(28) & 0x3fff; }
    else if (fmt === "VP8L") { const v = buf.readUInt32LE(21); out.width = (v & 0x3fff) + 1; out.height = ((v >> 14) & 0x3fff) + 1; }
  } else out.problems.push("not a PNG, JPEG or WebP image");
  if (out.mime && (!out.width || !out.height || out.width < 1 || out.height < 1)) out.problems.push("could not read image dimensions");
  out.ok = out.mime !== null && out.problems.length === 0;
  return out;
}
