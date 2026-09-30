// Dev/demo only: generates a real, valid PNG (gradient in the creator's color) so file storage, inspection and UI paths can be exercised
// without an image provider. It is provider "mock" and is NEVER a generated likeness of anyone.
import { deflateSync } from "node:zlib";

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };

export function placeholderPng(hex: string, seed = 0, w = 512, h = 768): Uint8Array {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const row = Buffer.alloc(1 + w * 3);
  const raw = Buffer.alloc(h * row.length);
  for (let y = 0; y < h; y++) {
    const o = y * row.length;
    const k = 0.25 + 0.75 * (1 - y / h);
    for (let x = 0; x < w; x++) {
      const stripe = ((x + seed * 37) % 64) < 2 ? 25 : 0;
      raw[o + 1 + x * 3] = Math.min(255, r * k + stripe); raw[o + 2 + x * 3] = Math.min(255, g * k + stripe); raw[o + 3 + x * 3] = Math.min(255, b * k + stripe);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
