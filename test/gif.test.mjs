import test from 'node:test';
import assert from 'node:assert/strict';
import { GifEncoder } from '../public/gif.js';

// A minimal GIF reader for the encoder's own output: local color tables, LZW, frames drawn over the previous one.
function decode(bytes) {
  const u16 = at => bytes[at] | (bytes[at + 1] << 8);
  assert.equal(String.fromCharCode(...bytes.slice(0, 6)), 'GIF89a');
  const width = u16(6), height = u16(8), canvas = new Uint8Array(width * height * 3), frames = [];
  let at = 13, delay = 0, loops = false;
  while (bytes[at] !== 0x3b) {
    if (bytes[at] === 0x21) {
      if (bytes[at + 1] === 0xf9) delay = u16(at + 4);
      if (bytes[at + 1] === 0xff) loops = String.fromCharCode(...bytes.slice(at + 3, at + 14)) === 'NETSCAPE2.0';
      at += 2; while (bytes[at]) at += bytes[at] + 1; at++;
      continue;
    }
    assert.equal(bytes[at], 0x2c);
    const x = u16(at + 1), y = u16(at + 3), w = u16(at + 5), h = u16(at + 7), bits = (bytes[at + 9] & 7) + 1;
    const table = bytes.slice(at + 10, at + 10 + (3 << bits));
    at += 10 + (3 << bits);
    const minSize = bytes[at++], data = [];
    while (bytes[at]) { data.push(...bytes.slice(at + 1, at + 1 + bytes[at])); at += bytes[at] + 1; }
    at++;
    const clear = 1 << minSize, out = [];
    let size = minSize + 1, dict = [], prev = null, acc = 0, accBits = 0, p = 0;
    const reset = () => { dict = Array.from({ length: clear + 2 }, (_, i) => [i]); size = minSize + 1; prev = null; };
    reset();
    for (;;) {
      while (accBits < size) { acc |= data[p++] << accBits; accBits += 8; }
      const code = acc & ((1 << size) - 1); acc >>>= size; accBits -= size;
      if (code === clear) { reset(); continue; }
      if (code === clear + 1) break;
      const entry = code < dict.length ? dict[code] : [...prev, prev[0]];
      out.push(...entry);
      if (prev) dict.push([...prev, entry[0]]);
      if (dict.length === 1 << size && size < 12) size++;
      prev = entry;
    }
    assert.equal(out.length, w * h);
    out.forEach((k, i) => canvas.set(table.slice(k * 3, k * 3 + 3), ((y + Math.floor(i / w)) * width + x + (i % w)) * 3));
    frames.push({ pixels: canvas.slice(), delay, rect: [x, y, w, h] });
  }
  return { width, height, frames, loops };
}

test('the replay GIF keeps every frame exact, stores only what changed and holds unchanged frames', () => {
  const W = 120, H = 80, colors = Array.from({ length: 150 }, (_, i) => [(i * 37) % 32 * 8, (i * 11) % 32 * 8, (i * 23) % 32 * 8]);
  let seed = 3; const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const base = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) base.set([...colors[Math.floor(random() * colors.length)], 255], i * 4); // fills the LZW table
  const second = new Uint8ClampedArray(base);
  for (let y = 10; y < 30; y++) for (let x = 40; x < 70; x++) second.set([255, 0, 0, 255], (y * W + x) * 4);
  const gif = new GifEncoder(W, H);
  gif.addFrame(base, 14); gif.addFrame(second, 14); gif.addFrame(second, 9); gif.hold(250);
  const { width, height, frames, loops } = decode(gif.finish());
  assert.deepEqual([width, height, loops], [W, H, true]);
  assert.equal(frames.length, 2, 'the unchanged frame becomes a longer hold');
  assert.deepEqual(frames.map(f => f.delay), [14, 14 + 9 + 250]);
  assert.deepEqual(frames[1].rect, [40, 10, 30, 20], 'only the changed rectangle is stored');
  const rgb = rgba => rgba.filter((_, i) => i % 4 !== 3);
  assert.deepEqual([...frames[0].pixels], [...rgb(base)]);
  assert.deepEqual([...frames[1].pixels], [...rgb(second)]);
});
