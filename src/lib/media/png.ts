// Minimal, dependency-free PNG toolkit (8-bit, non-interlaced; grey / grey+alpha / RGB / RGBA).
// Used ONLY to derive new files (4:5 delivery crops, downscaled QA copies). Source bytes are never modified.
import { deflateSync, inflateSync } from "node:zlib";

export class PngError extends Error {}
export interface Raster { width: number; height: number; channels: 1 | 2 | 3 | 4; data: Uint8Array }

const SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CT_CHANNELS: Record<number, 1 | 2 | 3 | 4> = { 0: 1, 4: 2, 2: 3, 6: 4 };
const CHANNEL_CT: Record<number, number> = { 1: 0, 2: 4, 3: 2, 4: 6 };

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function decodePng(bytes: Uint8Array): Raster {
  if (bytes.length < 8 || SIG.some((v, i) => bytes[i] !== v)) throw new PngError("not a PNG file");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8, width = 0, height = 0, depth = 0, ct = -1, interlace = 0;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= bytes.length) {
    const len = dv.getUint32(pos), type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const body = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { const h = new DataView(body.buffer, body.byteOffset, body.byteLength); width = h.getUint32(0); height = h.getUint32(4); depth = body[8]; ct = body[9]; interlace = body[12]; }
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const channels = CT_CHANNELS[ct];
  if (!width || !height || !channels) throw new PngError(`unsupported PNG colour type ${ct}`);
  if (depth !== 8) throw new PngError(`unsupported PNG bit depth ${depth}`);
  if (interlace !== 0) throw new PngError("interlaced PNG is not supported");
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new PngError("truncated PNG data");
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= channels ? out[dst + i - channels] : 0;
      const b = y > 0 ? out[dst - stride + i] : 0;
      const c = y > 0 && i >= channels ? out[dst - stride + i - channels] : 0;
      let v: number;
      switch (f) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: throw new PngError(`bad PNG filter ${f}`);
      }
      out[dst + i] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

/** `filter`: PNG scanline filter type 0..4 (None/Sub/Up/Average/Paeth). Sub is the default; others exist so decoding can be tested against every filter. */
export function encodePng(r: Raster, filter: 0 | 1 | 2 | 3 | 4 = 1): Uint8Array {
  const stride = r.width * r.channels, bpp = r.channels;
  const raw = Buffer.alloc((stride + 1) * r.height);
  for (let y = 0; y < r.height; y++) {
    const o = y * (stride + 1); raw[o] = filter;
    for (let i = 0; i < stride; i++) {
      const x = r.data[y * stride + i], a = i >= bpp ? r.data[y * stride + i - bpp] : 0, b = y > 0 ? r.data[(y - 1) * stride + i] : 0, c = y > 0 && i >= bpp ? r.data[(y - 1) * stride + i - bpp] : 0;
      const pa = Math.abs(a + b - c - a), pb = Math.abs(a + b - c - b), pc = Math.abs(a + b - c - c);
      const pred = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[o + 1 + i] = (x - pred) & 0xff;
    }
  }
  const chunk = (type: string, body: Uint8Array) => {
    const b = Buffer.alloc(12 + body.length);
    b.writeUInt32BE(body.length, 0); b.write(type, 4, "latin1"); b.set(body, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + body.length)), 8 + body.length);
    return b;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(r.width, 0); ihdr.writeUInt32BE(r.height, 4); ihdr[8] = 8; ihdr[9] = CHANNEL_CT[r.channels]; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from(SIG), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", new Uint8Array(0))]));
}

/** Pure crop: copies a rectangle. Never scales, so nothing is distorted. */
export function cropRaster(r: Raster, x: number, y: number, w: number, h: number): Raster {
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > r.width || y + h > r.height) throw new PngError("crop rectangle outside the image");
  const out = new Uint8Array(w * h * r.channels);
  for (let row = 0; row < h; row++) out.set(r.data.subarray(((y + row) * r.width + x) * r.channels, ((y + row) * r.width + x + w) * r.channels), row * w * r.channels);
  return { width: w, height: h, channels: r.channels, data: out };
}

/** Area-average downscale preserving aspect ratio (QA preview copies only; never used for delivery assets). */
export function downscaleRaster(r: Raster, maxWidth: number): Raster {
  if (r.width <= maxWidth) return r;
  const dw = maxWidth, dh = Math.max(1, Math.round((r.height * dw) / r.width)), ch = r.channels;
  const out = new Uint8Array(dw * dh * ch), sx = r.width / dw, sy = r.height / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(r.height, Math.max(y0 + 1, Math.floor((y + 1) * sy)));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(r.width, Math.max(x0 + 1, Math.floor((x + 1) * sx)));
      for (let c = 0; c < ch; c++) {
        let sum = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { sum += r.data[(yy * r.width + xx) * ch + c]; n++; }
        out[(y * dw + x) * ch + c] = Math.round(sum / n);
      }
    }
  }
  return { width: dw, height: dh, channels: ch, data: out };
}
