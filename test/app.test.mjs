import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLibrary, validateStyle } from '../lib.mjs';
import { makeApp } from '../server.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const variant = n => Buffer.concat([png, Buffer.from([n])]); // same valid PNG header, distinct bytes and hash
test('matching styles group images, persist across reloads, and preserve images during merge and move', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-library-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const library = await createLibrary(dir);
  const a = await library.add({ name: 'Cut paper collage', keywords: ['paper art'] }, { id: 'a' });
  const b = await library.add({ name: 'CUT-PAPER COLLAGE', keywords: ['cutout'] }, { id: 'b' });
  assert.equal(a.id, b.id); assert.equal(b.images.length, 2);
  const custom = await library.add({ name: 'Paper relief', keywords: ['paper relief art'] }, { id: 'c' });
  const merged = await library.edit(custom.id, { name: a.name, keywords: ['relief art'] });
  assert.equal(merged.images.length, 3);
  const empty = await library.add({ name: 'Oil painting', keywords: ['oil paint'] });
  await library.move('a', empty.id);
  const reloaded = await createLibrary(dir);
  assert.equal(reloaded.list().find(s => s.id === a.id).images.length, 2);
  assert.equal(reloaded.list().find(s => s.id === empty.id).images[0].id, 'a');
});

test('parallel saves are not lost and a rejected edit does not poison later saves', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-concurrent-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const library = await createLibrary(dir);
  await assert.rejects(library.add({ name: 'A paragraph. More text.', keywords: ['a'] }));
  await Promise.all(Array.from({ length: 10 }, (_, i) => library.add({ name: 'Unique medium', keywords: ['medium'] }, { id: String(i) })));
  assert.equal(library.list().find(s => s.name === 'Unique medium').images.length, 10);
  assert.throws(() => validateStyle({ name: 'Style', keywords: [] }));
});

test('HTTP upload, automatic match, manual import, invalid files, and origin protection', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-http-'));
  let calls = 0;
  const server = await makeApp({ dataDir: dir, loadPin: async url => { assert.equal(url, 'https://pin.it/test'); return { buffer: variant(4), sourceUrl: 'https://www.pinterest.com/pin/123/', name: 'Pinterest pin 123' }; }, status: async () => ({ connected: true }), analyze: async (_path, styles) => { calls++; return { name: 'Layered textured paper diorama', keywords: ['paper diorama'], tags: ['layered paper', 'grainy texture', 'soft shadows'], existingStyleId: styles.find(s => s.name === 'Layered textured paper diorama')?.id || null }; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Artbook-Request': '1' };
  let response = await fetch(`${base}/api/import`, { method: 'POST', headers, body: png });
  assert.equal(response.status, 201); const first = await response.json();
  response = await fetch(`${base}/api/import`, { method: 'POST', headers, body: png });
  assert.equal(response.status, 409);
  const duplicate = await response.json();
  assert.match(duplicate.error, /already saved/);
  assert.deepEqual(duplicate.duplicate, { styleId: first.style.id, imageId: first.image.id, filename: first.image.filename });
  assert.equal(calls, 1, 'duplicates are rejected before analysis');
  response = await fetch(`${base}/api/import`, { method: 'POST', headers, body: variant(2) });
  assert.equal((await response.json()).style.images.length, 2);
  response = await fetch(`${base}/api/import?styleId=${first.style.id}`, { method: 'POST', headers, body: variant(3) });
  assert.equal((await response.json()).style.images.length, 3); assert.equal(calls, 2);
  response = await fetch(`${base}/api/import-link`, { method: 'POST', headers, body: JSON.stringify({ url: 'https://pin.it/test' }) });
  assert.equal(response.status, 201);
  const pin = await response.json();
  assert.equal(pin.style.id, first.style.id);
  assert.equal(pin.style.images.length, 4);
  assert.equal(pin.image.sourceUrl, 'https://www.pinterest.com/pin/123/');
  assert.equal(calls, 3);
  response = await fetch(`${base}/images/${first.image.filename}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal((await fetch(`${base}/api/import`, { method: 'POST', headers, body: 'not an image' })).status, 400);
  assert.equal((await fetch(`${base}/api/styles`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${base}/api/import`, { method: 'POST', body: png })).status, 403);
  assert.equal((await fetch(`${base}/data/library.json`)).status, 404);
  const saved = JSON.parse(await readFile(join(dir, 'library.json')));
  assert.equal(saved.styles.find(s => s.id === first.style.id).images.length, 4);
  response = await fetch(`${base}/api/images/${first.image.id}`, { method: 'DELETE', headers });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).images.length, 3);
  assert.equal((await fetch(`${base}/images/${first.image.filename}`)).status, 404);
  assert.equal((await fetch(`${base}/api/images/${first.image.id}`, { method: 'DELETE', headers })).status, 400);
  assert.equal((await fetch(`${base}/api/images/${pin.image.id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await fetch(`${base}/api/styles/${first.style.id}`, { method: 'DELETE', headers })).status, 400, 'styles with images cannot be deleted');
  const empty = await (await fetch(`${base}/api/styles`, { method: 'POST', headers, body: JSON.stringify({ name: 'Empty one', keywords: ['x'] }) })).json();
  response = await fetch(`${base}/api/styles/${empty.id}`, { method: 'DELETE', headers });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).name, 'Empty one');
  assert.equal((await (await fetch(`${base}/api/styles`, { headers })).json()).some(s => s.id === empty.id), false);
});

test('analysis failure keeps library intact and permits retry', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-failure-'));
  const server = await makeApp({ dataDir: dir, analyze: async () => { throw new Error('Usage limit reached'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (let i = 0; i < 2; i++) {
    const result = await fetch(`${base}/api/import`, { method: 'POST', headers: { 'X-Artbook-Request': '1' }, body: png });
    assert.equal(result.status, 400); assert.match((await result.json()).error, /Usage limit/);
  }
  assert.equal((await (await fetch(`${base}/api/styles`)).json()).flatMap(s => s.images).length, 0);
});

test('duplicate check also finds images saved before hashes were stored', async t => {
  const { findDuplicate } = await import('../server.mjs');
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const dir = await mkdtemp(join(tmpdir(), 'artbook-legacy-hash-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'images'), { recursive: true });
  await writeFile(join(dir, 'images', 'old.png'), png);
  const styles = [{ id: 's', name: 'Old style', images: [{ id: 'old', filename: 'old.png' }, { id: 'gone', filename: 'missing.png' }] }];
  const hash = createHash('sha256').update(png).digest('hex');
  assert.equal((await findDuplicate(styles, dir, hash)).image.id, 'old');
  assert.equal(await findDuplicate(styles, dir, 'f'.repeat(64)), null);
});

test('an import keeps running after the page disconnects and its job can be looked up', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-jobs-'));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const server = await makeApp({ dataDir: dir, analyze: async () => { await gate; return { name: 'Slow style', keywords: ['slow'], tags: ['a', 'b', 'c'], existingStyleId: null, details: { title: 'Known work' } }; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Artbook-Request': '1' };
  const jobId = 'job-reload-test-1';
  const controller = new AbortController();
  const request = fetch(`${base}/api/import`, { method: 'POST', headers: { ...headers, 'X-Job-Id': jobId }, body: variant(9), signal: controller.signal }).catch(() => 'aborted');
  let job;
  for (let i = 0; i < 50 && job?.status !== 'running'; i++) { [job] = await (await fetch(`${base}/api/jobs?ids=${jobId}`, { headers })).json(); await new Promise(r => setTimeout(r, 10)); }
  assert.equal(job.status, 'running');
  assert.equal(job.hash, undefined, 'hashes stay private');
  controller.abort(); // the page reloads
  assert.equal(await request, 'aborted');
  release();
  for (let i = 0; i < 50 && job.status !== 'done'; i++) { await new Promise(r => setTimeout(r, 10)); [job] = await (await fetch(`${base}/api/jobs?ids=${jobId}`, { headers })).json(); }
  assert.equal(job.status, 'done');
  assert.equal(job.result.style.name, 'Slow style');
  assert.equal(job.result.image.title, 'Known work');
  const styles = await (await fetch(`${base}/api/styles`, { headers })).json();
  assert.equal(styles.find(s => s.name === 'Slow style').images.length, 1);
  assert.deepEqual(await (await fetch(`${base}/api/jobs?ids=unknown-job-id`, { headers })).json(), [{ id: 'unknown-job-id', status: 'missing' }]);
});

test('imports and re-identifies queue instead of being rejected', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-queue-'));
  let release; let gate = new Promise(resolve => { release = resolve; });
  let n = 0;
  const server = await makeApp({ dataDir: dir, analyze: async () => { await gate; n++; return { name: `Queued style ${n}`, keywords: ['q'], tags: ['a', 'b', 'c'], existingStyleId: null }; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Artbook-Request': '1' };
  const first = fetch(`${base}/api/import`, { method: 'POST', headers: { ...headers, 'X-Job-Id': 'queue-job-1' }, body: variant(20) });
  const second = fetch(`${base}/api/import`, { method: 'POST', headers: { ...headers, 'X-Job-Id': 'queue-job-2' }, body: variant(21) });
  let states = [];
  for (let i = 0; i < 50 && states.map(s => s.status).join() !== 'running,queued'; i++) { await new Promise(r => setTimeout(r, 10)); states = await (await fetch(`${base}/api/jobs?ids=queue-job-1,queue-job-2`, { headers })).json(); }
  assert.deepEqual(states.map(s => s.status), ['running', 'queued']);
  assert.equal((await fetch(`${base}/api/import`, { method: 'POST', headers, body: variant(21) })).status, 409, 'same file already in the queue');
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  const imported = (await b.json()).image;
  gate = new Promise(resolve => { release = resolve; });
  const reclassify = fetch(`${base}/api/reclassify`, { method: 'POST', headers: { ...headers, 'X-Job-Id': 'queue-job-3' }, body: JSON.stringify({ imageId: imported.id }) });
  for (let i = 0, job; i < 50 && job?.status !== 'running'; i++) { await new Promise(r => setTimeout(r, 10)); [job] = await (await fetch(`${base}/api/jobs?ids=queue-job-3`, { headers })).json(); }
  const again = await fetch(`${base}/api/reclassify`, { method: 'POST', headers, body: JSON.stringify({ imageId: imported.id }) });
  assert.equal(again.status, 409, 'one re-identify per image at a time');
  release();
  assert.equal((await reclassify).status, 200);
});

test('imports record AI origin from file metadata and visible watermarks, and nothing otherwise', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-ai-'));
  let watermark = null;
  const server = await makeApp({ dataDir: dir, analyze: async () => ({ name: 'Any style', keywords: ['x'], tags: ['a', 'b', 'c'], existingStyleId: null, aiWatermark: watermark }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Artbook-Request': '1' };
  const send = async body => (await (await fetch(`${base}/api/import`, { method: 'POST', headers, body })).json()).image;
  assert.deepEqual((await send(Buffer.concat([png, Buffer.from('jumb c2pa OpenAI trainedAlgorithmicMedia', 'latin1')]))).aiOrigin, { status: 'confirmed', evidence: 'Content Credentials (OpenAI)' });
  watermark = 'Meta AI';
  assert.deepEqual((await send(variant(30))).aiOrigin, { status: 'likely', evidence: 'Visible “Meta AI” watermark' });
  watermark = null;
  assert.equal((await send(variant(31))).aiOrigin, null);
});
