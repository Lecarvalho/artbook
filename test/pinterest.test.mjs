import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPinterestImage } from '../pinterest.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
test('short pin link resolves image metadata, downloads bytes and retains canonical source', async () => {
  const urls = [];
  const result = await loadPinterestImage('https://pin.it/example', async (url, options) => {
    urls.push(url); assert.equal(options.redirect, 'manual');
    if (urls.length === 1) return new Response(null, { status: 302, headers: { location: 'https://www.pinterest.com/pin/12345/?tracking=1' } });
    if (urls.length === 2) return new Response('<meta content="https://i.pinimg.com/originals/test.png?a=1&amp;b=2" property="og:image">');
    return new Response(png);
  });
  assert.equal(result.sourceUrl, 'https://www.pinterest.com/pin/12345/');
  assert.equal(urls[2], 'https://i.pinimg.com/originals/test.png?a=1&b=2');
  assert.deepEqual(result.buffer, png);
});
test('rejects non-Pinterest URLs, boards and credentials before fetching', async () => {
  for (const url of ['http://127.0.0.1/', 'https://www.pinterest.com.evil.test/pin/1/', 'https://user@pinterest.com/pin/1/', 'https://pinterest.com:444/pin/1/', 'https://pinterest.com/some/board/']) {
    await assert.rejects(loadPinterestImage(url, () => { throw new Error('Must not fetch'); }), error => !error.message.includes('Must not fetch'));
  }
});
test('blocks off-site redirects and image sources, and handles missing/private pins', async () => {
  await assert.rejects(loadPinterestImage('https://pin.it/test', async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } })), /Only HTTPS/);
  await assert.rejects(loadPinterestImage('https://pinterest.com/pin/1/', async () => new Response('<meta property="og:image" content="https://evil.test/pic.png">')), /Only HTTPS/);
  await assert.rejects(loadPinterestImage('https://pinterest.com/pin/1/', async () => new Response('Sign in')), /private or unavailable/);
  await assert.rejects(loadPinterestImage('https://pinterest.com/pin/1/', async () => new Response(null, { status: 403 })), /private or unavailable/);
});
test('rejects oversized remote images and non-image bytes', async () => {
  let calls = 0;
  await assert.rejects(loadPinterestImage('https://pinterest.com/pin/1/', async () => ++calls === 1 ? new Response('<meta property="og:image" content="https://i.pinimg.com/a.png">') : new Response(Buffer.alloc(15 * 1024 * 1024 + 1))), /exceeds 15 MB/);
  calls = 0;
  await assert.rejects(loadPinterestImage('https://pinterest.com/pin/1/', async () => ++calls === 1 ? new Response('<meta property="og:image" content="https://i.pinimg.com/a.png">') : new Response('not an image')), /Choose a PNG/);
});
