import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { loadImageLink, publicAddress } from '../remote-image.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
function response(bytes, statusCode = 200, headers = {}) {
  return Object.assign(Readable.from([Buffer.from(bytes)]), { statusCode, headers });
}
test('direct image imports follow redirects and preserve original source', async () => {
  const visited = [];
  const result = await loadImageLink('https://example.com/picture', async url => {
    visited.push(url.href);
    return visited.length === 1 ? response('', 302, { location: '/image.png' }) : response(png);
  });
  assert.deepEqual(visited, ['https://example.com/picture', 'https://example.com/image.png']);
  assert.deepEqual(result.buffer, png);
  assert.equal(result.sourceUrl, 'https://example.com/picture');
});
test('rejects web pages, oversized images and failed hosts', async () => {
  await assert.rejects(loadImageLink('https://example.com/', async () => response('<html>Website</html>')), /Copy the image address/);
  await assert.rejects(loadImageLink('https://example.com/a.png', async () => response(Buffer.alloc(15 * 1024 * 1024 + 1))), /exceeds 15 MB/);
  await assert.rejects(loadImageLink('https://example.com/a.png', async () => response('', 403)), /could not be downloaded/);
});
test('blocks private IPv4, IPv6, mapped addresses and unsafe URL schemes', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.1.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1', '2001:db8::1', '2002:7f00:1::']) assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
  for (const url of ['file:///etc/passwd', 'https://user:password@example.com/a.png', 'http://example.com:8000/a.png']) await assert.rejects(loadImageLink(url), /public HTTP/);
  await assert.rejects(loadImageLink('http://127.0.0.1/a.png'), /private network/);
});
test('rejects a public image URL redirecting to a private service', async () => {
  // Use the real downloader for the redirected hop so it must validate DNS before connecting.
  let first = true;
  const result = loadImageLink('https://example.com/a.png', async url => {
    if (first) { first = false; return response('', 302, { location: 'http://127.0.0.1/private' }); }
    await loadImageLink(url.href);
  });
  await assert.rejects(result, /private network/);
});
