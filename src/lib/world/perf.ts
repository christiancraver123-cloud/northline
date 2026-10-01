// Frame statistics for the dev overlay — pure ring buffer. NOTE: headless/software GL numbers are a regression signal only, not a GPU benchmark.
export class FrameStats {
  private buf: number[] = []; constructor(private cap = 240) {}
  push(ms: number) { if (ms > 0 && ms < 1000) { this.buf.push(ms); if (this.buf.length > this.cap) this.buf.shift(); } }
  get count() { return this.buf.length; }
  get avgMs() { return this.buf.length ? this.buf.reduce((a, b) => a + b, 0) / this.buf.length : 0; }
  get fps() { return this.avgMs ? 1000 / this.avgMs : 0; }
  /** "1% low": FPS implied by the 99th-percentile frame time. */
  get onePercentLowFps() { if (!this.buf.length) return 0; const s = [...this.buf].sort((a, b) => a - b); return 1000 / s[Math.min(s.length - 1, Math.floor(s.length * 0.99))]; }
  get recentMs() { return this.buf.slice(-5).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(5, this.buf.length)); }
}
