import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { imageExtension } from './lib.mjs';
import { loadPinterestImage } from './pinterest.mjs';

const privateAddresses = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) privateAddresses.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) privateAddresses.addSubnet(address, prefix, 'ipv6');

export function publicAddress(address) {
  return isIP(address) === 4 ? !privateAddresses.check(address, 'ipv4') : isIP(address) === 6 && globalV6.check(address, 'ipv6') && !privateAddresses.check(address, 'ipv6');
}

function imageURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Paste a full image URL or Pinterest pin link.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('Use a public HTTP or HTTPS image URL without credentials or a custom port.');
  return url;
}

// Resolve and pin the connection address so a public hostname cannot redirect DNS to local services.
async function publicRequest(url, signal) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error('Use a public image URL. Local and private network addresses are not supported.');
  signal.throwIfAborted();
  const chosen = addresses.find(item => item.family === 4) || addresses[0];
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      signal,
      headers: { Accept: 'image/jpeg,image/png,image/webp', 'User-Agent': 'Artbook/1.0' },
      lookup: (_host, options, callback) => options.all ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family),
    }, resolve);
    request.on('error', reject);
  });
}

export async function loadImageLink(value, request = publicRequest) {
  let url = imageURL(value);
  if (url.hostname === 'pin.it' || /(^|\.)pinterest\./.test(url.hostname)) return loadPinterestImage(value);
  const signal = AbortSignal.timeout(30000);
  try {
    for (let hop = 0; hop < 6; hop++) {
      const response = await request(url, signal);
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.destroy();
        if (!response.headers.location) throw new Error('The image link has an invalid redirect.');
        url = imageURL(new URL(response.headers.location, url).href);
        continue;
      }
      if (response.statusCode !== 200) { response.destroy(); throw new Error('The image could not be downloaded. Try another link or upload the image directly.'); }
      const chunks = []; let size = 0;
      for await (const chunk of response) {
        size += chunk.length;
        if (size > 15 * 1024 * 1024) throw new Error('The image exceeds 15 MB. Choose a smaller image.');
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      try { imageExtension(buffer); } catch { throw new Error('This URL does not return a PNG, JPEG or WebP image. Copy the image address, not the webpage address.'); }
      return { buffer, sourceUrl: imageURL(value).href, name: `Image from ${url.hostname}` };
    }
    throw new Error('This image link redirects too many times. Try a direct image URL.');
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') throw new Error('The image download timed out. Try again or upload it directly.');
    if (error.code) throw new Error('The image host could not be reached. Check the link or upload the image directly.');
    throw error;
  }
}
