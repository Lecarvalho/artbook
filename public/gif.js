// A small animated GIF (GIF89a) encoder for the drawing replay, with no dependencies.
// Each frame gets its own 256-color palette (median cut over a 15-bit color histogram) and only the rectangle that
// changed since the previous frame is stored, drawn over it (disposal "keep"). The animation loops.
export class GifEncoder {
  constructor(width, height) {
    this.width = width; this.height = height;
    this.frames = []; this.previous = null;
  }
  // rgba: the full frame's pixels (ImageData.data); delay in hundredths of a second.
  addFrame(rgba, delay) {
    const { width, height } = this, now = new Uint32Array(rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + width * height * 4));
    let x0 = 0, y0 = 0, x1 = width - 1, y1 = height - 1;
    if (this.previous) {
      const before = this.previous;
      x0 = width; y0 = height; x1 = -1; y1 = -1;
      for (let y = 0; y < height; y++) for (let x = 0, i = y * width; x < width; x++, i++) {
        if (now[i] === before[i]) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (x1 < 0) { this.frames.at(-1).delay += delay; return; } // nothing changed: hold the last frame longer
    }
    this.previous = now;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, crop = new Uint8Array(w * h * 4), src = new Uint8Array(now.buffer);
    for (let y = 0; y < h; y++) crop.set(src.subarray(((y0 + y) * width + x0) * 4, ((y0 + y) * width + x1 + 1) * 4), y * w * 4);
    const { palette, indices } = quantize(crop);
    this.frames.push({ x: x0, y: y0, w, h, palette, indices, delay });
  }
  // Extra time on the last frame (hundredths of a second), so the finished drawing holds before the loop restarts.
  hold(delay) { if (this.frames.length) this.frames.at(-1).delay += delay; }
  finish() {
    const out = [];
    const bytes = (...list) => { for (const b of list) out.push(b); };
    const u16 = n => bytes(n & 255, (n >> 8) & 255);
    bytes(...[...'GIF89a'].map(c => c.charCodeAt(0)));
    u16(this.width); u16(this.height); bytes(0x70, 0, 0); // no global color table
    bytes(0x21, 0xff, 0x0b, ...[...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 3, 1, 0, 0, 0); // loop forever
    for (const f of this.frames) {
      const bits = Math.max(1, Math.ceil(Math.log2(f.palette.length / 3)));
      bytes(0x21, 0xf9, 4, 0x04); u16(Math.min(65535, Math.max(2, Math.round(f.delay)))); bytes(0, 0);
      bytes(0x2c); u16(f.x); u16(f.y); u16(f.w); u16(f.h); bytes(0x80 | (bits - 1));
      const table = new Uint8Array(3 << bits); table.set(f.palette);
      for (const b of table) out.push(b);
      const minSize = Math.max(2, bits), data = lzw(f.indices, minSize);
      bytes(minSize);
      for (let i = 0; i < data.length; i += 255) { const block = data.slice(i, i + 255); out.push(block.length); for (const b of block) out.push(b); }
      bytes(0);
    }
    bytes(0x3b);
    return new Uint8Array(out);
  }
}

// Median cut over the 15-bit histogram: the box with the widest channel range (weighted by its pixels) is split at
// its weighted median until there are 256 boxes; each color maps to its box, whose color is the average of its pixels.
function quantize(rgba) {
  const count = new Uint32Array(32768), sum = new Float64Array(32768 * 3), n = rgba.length / 4, keys = new Uint16Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const key = ((rgba[p] >> 3) << 10) | ((rgba[p + 1] >> 3) << 5) | (rgba[p + 2] >> 3);
    keys[i] = key; count[key]++; sum[key * 3] += rgba[p]; sum[key * 3 + 1] += rgba[p + 1]; sum[key * 3 + 2] += rgba[p + 2];
  }
  const used = [];
  for (let k = 0; k < 32768; k++) if (count[k]) used.push(k);
  const channel = (k, c) => (k >> (10 - c * 5)) & 31;
  const measure = list => {
    let best = 0, range = -1, total = 0;
    for (let c = 0; c < 3; c++) {
      let lo = 31, hi = 0;
      for (const k of list) { const v = channel(k, c); if (v < lo) lo = v; if (v > hi) hi = v; }
      if (hi - lo > range) { range = hi - lo; best = c; }
    }
    for (const k of list) total += count[k];
    return { list, channel: best, range, score: range * Math.sqrt(total), total };
  };
  const boxes = [measure(used)];
  while (boxes.length < 256) {
    let at = -1;
    for (let b = 0; b < boxes.length; b++) if (boxes[b].range > 0 && (at < 0 || boxes[b].score > boxes[at].score)) at = b;
    if (at < 0) break;
    const box = boxes[at], c = box.channel;
    box.list.sort((a, b) => channel(a, c) - channel(b, c));
    let seen = 0, cut = 1;
    for (let i = 0; i < box.list.length - 1; i++) { seen += count[box.list[i]]; cut = i + 1; if (seen * 2 >= box.total) break; }
    boxes.splice(at, 1, measure(box.list.slice(0, cut)), measure(box.list.slice(cut)));
  }
  const index = new Uint8Array(32768), palette = [];
  boxes.forEach((box, b) => {
    let r = 0, g = 0, bl = 0;
    for (const k of box.list) { index[k] = b; r += sum[k * 3]; g += sum[k * 3 + 1]; bl += sum[k * 3 + 2]; }
    palette.push(Math.round(r / box.total), Math.round(g / box.total), Math.round(bl / box.total));
  });
  if (palette.length < 6) palette.push(0, 0, 0, 0, 0, 0); // at least two colors
  const indices = new Uint8Array(n);
  for (let i = 0; i < n; i++) indices[i] = index[keys[i]];
  return { palette, indices };
}

// Variable-length LZW as GIF uses it, with a clear code when the 4096-entry table is full.
function lzw(indices, minSize) {
  const out = [], clear = 1 << minSize, end = clear + 1;
  let size = minSize + 1, next = end + 1, table = new Map(), acc = 0, accBits = 0;
  const emit = code => { acc |= code << accBits; accBits += size; while (accBits >= 8) { out.push(acc & 255); acc >>>= 8; accBits -= 8; } };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = (prefix << 8) | k, hit = table.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) { table.set(key, next++); if (next > (1 << size) && size < 12) size++; }
    else { emit(clear); table = new Map(); size = minSize + 1; next = end + 1; }
    prefix = k;
  }
  emit(prefix); emit(end);
  if (accBits > 0) out.push(acc & 255);
  return out;
}
