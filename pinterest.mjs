import { imageExtension } from './lib.mjs';

const pageHost = /^(?:(?:www|[a-z]{2})\.)?pinterest\.(?:com|ca|co\.uk|com\.au|de|fr|es|it|pt|com\.mx|com\.br|jp|co\.kr|at|ch|cl|dk|fi|ie|nz|se)$/;
const unavailable = 'Could not read this pin. It may be private or unavailable. Download its image from Pinterest and upload it here instead.';

function checkedURL(value, image = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Paste a Pinterest pin link or a pin.it share link.'); }
  const allowed = image ? url.hostname === 'i.pinimg.com' : pageHost.test(url.hostname) || url.hostname === 'pin.it';
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowed) throw new Error('Only HTTPS Pinterest pin links and pin.it share links are supported.');
  return url;
}

async function download(value, image, request) {
  let url = checkedURL(value, image);
  const signal = AbortSignal.timeout(25000);
  for (let hop = 0; hop < 6; hop++) {
    const response = await request(url.href, { redirect: 'manual', signal, headers: { Accept: image ? 'image/jpeg,image/png,image/webp' : 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; Artbook/1.0)' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      url = checkedURL(new URL(response.headers.get('location'), url).href, image);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(unavailable); }
    const limit = (image ? 15 : 5) * 1024 * 1024;
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) throw new Error(image ? 'The pin image exceeds 15 MB. Download a smaller image and upload it here.' : unavailable);
      chunks.push(chunk);
    }
    return { url, buffer: Buffer.concat(chunks) };
  }
  throw new Error(unavailable);
}

function decode(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi, entity => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const code = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

export async function loadPinterestImage(value, request = fetch) {
  const input = checkedURL(value);
  if (input.hostname !== 'pin.it' && !/^\/pin\/\d+\/?$/.test(input.pathname)) throw new Error('Use a link to one Pinterest pin, not a board or search page.');
  try {
    const page = await download(input.href, false, request);
    if (!pageHost.test(page.url.hostname) || !/^\/pin\/\d+\/?$/.test(page.url.pathname)) throw new Error(unavailable);
    const html = page.buffer.toString('utf8');
    let image;
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
      const attributes = {};
      for (const attr of tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) attributes[attr[1].toLowerCase()] = decode(attr[3]);
      if ((attributes.property || attributes.name)?.toLowerCase() === 'og:image') { image = attributes.content; break; }
    }
    if (!image) throw new Error(unavailable);
    const result = await download(image, true, request);
    imageExtension(result.buffer);
    return { buffer: result.buffer, sourceUrl: `${page.url.origin}${page.url.pathname}`, name: `Pinterest pin ${page.url.pathname.match(/\d+/)[0]}` };
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'TypeError') throw new Error('Pinterest could not be reached. Try again or upload the image directly.');
    throw error;
  }
}
