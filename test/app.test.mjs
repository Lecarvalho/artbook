import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLibrary, validateStyle } from '../lib.mjs';
import { makeApp, refinementPrompt } from '../server.mjs';

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

test('test generations retry once below the target, keep both attempts and their reasoning, and clean up files', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-generate-'));
  const prompts = [], judged = [], histories = [];
  let scores = [40, 82], failGenerate = false, failSecond = false, reclassifies = 0;
  const judgement = score => ({ scores: { palette: score, linework: score, rendering: score, texture: score, lighting: score, shapes: score + 6 }, differences: ['lines too thin', ''], summary: 'Close family, different linework.',
    evidence: [{ difference: 0, phrase: 'Lines too thin', original: { x: 0.9, y: 0.2, w: 0.3, h: 0.25 }, generated: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
      { difference: 1, phrase: 'empty', original: { x: 0, y: 0, w: 1, h: 1 }, generated: { x: 0, y: 0, w: 1, h: 1 } },
      { difference: 0, phrase: 'not in the note', original: { x: 0, y: 0, w: 0.5, h: 0.5 }, generated: { x: 0, y: 0, w: 0.5, h: 0.5 } },
      { list: 'strengths', difference: 0, phrase: 'warm washes', original: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, generated: { x: 0.4, y: 0.4, w: 0.3, h: 0.3 } }],
    strengths: ['same warm washes', ''] });
  const server = await makeApp({
    dataDir: dir, status: async () => ({ connected: true }),
    analyze: async () => { reclassifies++; return { name: 'Bold ink cartoon', keywords: ['ink cartoon'], tags: ['thick ink lines', 'flat color', 'simple shapes'], details: { stylePrompt: '[a lighthouse] thick ink lines' } }; },
    generate: async (prompt, job) => {
      assert.ok(job.startsWith(dir), 'generation work happens in the data directory');
      prompts.push(prompt);
      if (failGenerate || (failSecond && prompts.length > 1)) throw new Error('Generator declined.');
      return variant(100 + prompts.length);
    },
    judge: async (original, generated) => { judged.push([original, generated]); return judgement(scores.shift()); },
    recalibrate: async (_original, prompt, critique, _job, history, { onThought } = {}) => { assert.deepEqual(critique.differences, ['lines too thin']); histories.push(history.map(a => a.similarity)); onThought?.('Linework trails; pushing contour weight'); return { prompt: `${prompt}, heavier tapering lines\n\nColor palette: dominant #FFFFFF.`, changes: 'Asked for heavier lines.' }; },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Artbook-Request': '1' };
  const { image } = await (await fetch(`${base}/api/import`, { method: 'POST', headers, body: png })).json();
  const generate = prompt => fetch(`${base}/api/generate`, { method: 'POST', headers, body: JSON.stringify({ imageId: image.id, prompt }) });
  const stored = async () => JSON.parse(await readFile(join(dir, 'library.json'))).styles.flatMap(s => s.images).find(i => i.id === image.id);
  const generatedFiles = async () => (await import('node:fs/promises')).readdir(join(dir, 'images', 'generated')).catch(() => []);

  // Low first score: the prompt is refined from the critique and tried once more, then it stops.
  let response = await generate('[a lighthouse] thick ink lines');
  assert.equal(response.status, 200);
  let generation = (await response.json()).images.find(i => i.id === image.id).generations[0];
  // The generator gets the subject without brackets; the stored attempts keep them.
  assert.deepEqual(prompts, ['a lighthouse. thick ink lines', 'a lighthouse. thick ink lines, heavier tapering lines\n\nColor palette: dominant #FFFFFF.']);
  assert.equal(generation.attempts.length, 2);
  assert.equal(generation.attempts[0].prompt, '[a lighthouse] thick ink lines');
  assert.deepEqual(generation.attempts.map(a => a.similarity), [41, 83], 'similarity is the mean of the six trait scores');
  assert.equal(generation.attempts[0].change, null);
  assert.equal(generation.attempts[1].change, 'Asked for heavier lines.');
  assert.deepEqual(generation.attempts[0].differences, ['lines too thin']);
  // Evidence keeps one region pair per difference whose phrase appears in it, clamped inside each image.
  assert.deepEqual(generation.attempts[0].strengths, ['same warm washes']);
  assert.deepEqual(generation.attempts[0].evidence, [
    { list: 'differences', difference: 0, phrase: 'Lines too thin', original: { x: 0.7, y: 0.2, w: 0.3, h: 0.25 }, generated: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    { list: 'strengths', difference: 0, phrase: 'warm washes', original: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, generated: { x: 0.4, y: 0.4, w: 0.3, h: 0.3 } }]);
  assert.ok(judged.every(([original]) => original === join(dir, 'images', image.filename)), 'each attempt is judged against the original');
  for (const attempt of generation.attempts) {
    const served = await fetch(`${base}/images/generated/${attempt.filename}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png; charset=utf-8');
  }

  // The refined prompt can become the style prompt, without the palette line the interface adds.
  response = await fetch(`${base}/api/images/${image.id}/generations/${generation.id}/use-prompt`, { method: 'POST', headers, body: JSON.stringify({ attempt: 1 }) });
  assert.equal(response.status, 200);
  assert.equal((await stored()).stylePrompt, '[a lighthouse] thick ink lines, heavier tapering lines');
  assert.equal((await fetch(`${base}/api/images/${image.id}/generations/${generation.id}/use-prompt`, { method: 'POST', headers, body: JSON.stringify({ attempt: 5 }) })).status, 400);
  assert.equal((await fetch(`${base}/api/images/${image.id}/generations/${generation.id}/use-prompt`, { method: 'POST', body: JSON.stringify({ attempt: 1 }) })).status, 403);

  // Try again refines the newest attempt's prompt, knowing every earlier attempt, and appends one more attempt.
  prompts.length = 0; scores = [90];
  const retry = (id, jobId, payload = {}) => fetch(`${base}/api/images/${image.id}/generations/${id}/retry`, { method: 'POST', headers: jobId ? { ...headers, 'X-Job-Id': jobId } : headers, body: JSON.stringify(payload) });
  response = await retry(generation.id, 'retry-job-0001');
  assert.equal(response.status, 200);
  // The job carries live progress for the page to follow: reasoning lines, the reworked prompt, the judged attempt.
  const [live] = await (await fetch(`${base}/api/jobs?ids=retry-job-0001`, { headers })).json();
  assert.deepEqual(live.log, [{ step: 'retry-recalibrate', text: 'Linework trails; pushing contour weight' }]);
  assert.equal(live.refined.change, 'Asked for heavier lines.');
  assert.deepEqual(live.judged.map(j => j.similarity), [91]);
  generation = (await response.json()).images.find(i => i.id === image.id).generations[0];
  assert.equal(generation.attempts.length, 3);
  assert.equal(prompts.length, 1); assert.ok(prompts[0].startsWith(generation.attempts[1].prompt.replace('[a lighthouse] ', 'a lighthouse. ')), 'the retry starts from the newest prompt');
  assert.deepEqual(histories.at(-1), [41, 83]);
  assert.equal(generation.attempts[2].similarity, 91); assert.equal(generation.attempts[2].change, 'Asked for heavier lines.');
  assert.equal(generation.attempts[2].basedOn, 1, 'without a choice, the newest attempt is reworked');
  // The attempt being viewed can be reworked instead of the newest; out-of-range choices are rejected.
  prompts.length = 0; scores = [55];
  response = await retry(generation.id, null, { from: 0 });
  assert.equal(response.status, 200);
  generation = (await response.json()).images.find(i => i.id === image.id).generations[0];
  assert.equal(generation.attempts[3].basedOn, 0);
  assert.ok(prompts[0].startsWith('a lighthouse. thick ink lines, heavier tapering lines'), 'the retry starts from the chosen attempt');
  assert.equal(prompts[0].includes('heavier tapering lines, heavier tapering lines'), false);
  for (const from of [9, -1, 1.5, 'x']) assert.equal((await retry(generation.id, null, { from })).status, 400);
  // A test keeps at most eight attempts; unknown tests are rejected.
  scores = [50, 50, 50, 50];
  for (let n = 0; n < 4; n++) assert.equal((await retry(generation.id)).status, 200);
  response = await retry(generation.id);
  assert.equal(response.status, 400); assert.match((await response.json()).error, /at most 8 attempts/);
  assert.equal((await stored()).generations[0].attempts.length, 8);
  assert.equal((await retry('missing-generation')).status, 400);
  assert.equal((await fetch(`${base}/api/images/${image.id}/generations/${generation.id}/retry`, { method: 'POST', body: '{}' })).status, 403);

  // At or above the target, there is a single attempt.
  prompts.length = 0; scores = [75];
  generation = (await (await generate('[a fox] thick ink lines')).json()).images.find(i => i.id === image.id).generations[1];
  assert.equal(generation.attempts.length, 1); assert.equal(prompts.length, 1);

  // A failed retry keeps the first attempt and records why.
  prompts.length = 0; scores = [30]; failSecond = true;
  generation = (await (await generate('[a boat] thick ink lines')).json()).images.find(i => i.id === image.id).generations[2];
  assert.equal(generation.attempts.length, 1); assert.match(generation.error, /Second attempt failed: Generator declined/);
  assert.equal((await generatedFiles()).length, 10);

  // A failed first attempt leaves the image unchanged and writes no files.
  failGenerate = true; failSecond = false;
  response = await generate('[a tree] thick ink lines');
  assert.equal(response.status, 400); assert.match((await response.json()).error, /Generator declined/);
  assert.equal((await stored()).generations.length, 3);
  assert.equal((await generatedFiles()).length, 10);
  assert.equal((await generate('')).status, 400, 'an empty prompt is rejected');

  // Re-identifying keeps generations; deleting one removes its files; deleting the image removes the rest.
  assert.equal((await fetch(`${base}/api/reclassify`, { method: 'POST', headers, body: JSON.stringify({ imageId: image.id }) })).status, 200);
  assert.equal(reclassifies, 2);
  const kept = (await stored()).generations;
  assert.equal(kept.length, 3);
  response = await fetch(`${base}/api/images/${image.id}/generations/${kept[0].id}`, { method: 'DELETE', headers });
  assert.equal(response.status, 200);
  assert.equal((await stored()).generations.length, 2);
  assert.equal((await generatedFiles()).length, 2);
  assert.equal((await fetch(`${base}/images/generated/${kept[0].attempts[0].filename}`)).status, 404);
  assert.equal((await fetch(`${base}/api/images/${image.id}/generations/${kept[0].id}`, { method: 'DELETE', headers })).status, 400);
  assert.equal((await fetch(`${base}/api/images/${image.id}`, { method: 'DELETE', headers })).status, 200);
  assert.equal((await generatedFiles()).length, 0);
});

test('a refinement sees every attempt and asks for one new prompt', () => {
  const scores = value => ({ palette: value, linework: value, rendering: value, texture: value, lighting: value, shapes: value });
  const attempts = [
    { prompt: '[a fox] first wording', similarity: 70, scores: scores(70), change: null, differences: ['thin uniform contours'], strengths: ['warm ochre washes'] },
    { prompt: '[a fox] second wording', similarity: 64, scores: scores(64), change: 'cooler shadows', basedOn: 0, differences: ['shadows too blue'], strengths: [] },
    { prompt: '[a fox] third wording', similarity: 59, scores: scores(59), change: 'flatter fills', basedOn: 1, differences: ['thin uniform contours', 'no paper grain'], strengths: ['clean silhouettes'] },
  ];
  const text = refinementPrompt(attempts[2].prompt, { ...attempts[2], index: 2 }, attempts);
  // Earlier attempts bring their own critique, scores and lineage, not only a score.
  assert.match(text, /Attempt 1: 70% \(palette 70, linework 70, rendering 70, texture 70, lighting 70, shapes 70\), first prompt\n {2}difference: thin uniform contours\n {2}strength: warm ochre washes/);
  assert.match(text, /Attempt 2: 64% .*built from attempt 1; change: cooler shadows\n {2}difference: shadows too blue/);
  assert.match(text, /Attempt 3: 59% .*built from attempt 2; change: flatter fills\n {2}\(the attempt being reworked/);
  // The best attempt's prompt is offered as a reference; the reworked prompt stays the one to rewrite.
  assert.match(text, /Best attempt so far is attempt 1 \(70%\)[^\n]*\n"""\n\[a fox\] first wording\n"""/);
  assert.match(text, /Current prompt:\n"""\n\[a fox\] third wording\n"""$/);
  assert.match(text, /persistent: fix them first/);
  assert.match(text, /Never reintroduce a difference/);
  assert.match(text, /one complete new prompt/);
  assert.match(text, /positive description of the target look/);
  // A first refinement has no history block and no reference prompt.
  const first = refinementPrompt(attempts[0].prompt, attempts[0], [attempts[0]]);
  assert.doesNotMatch(first, /All attempts|Best attempt/);
  // When the reworked attempt is already the best, no reference prompt is added.
  assert.doesNotMatch(refinementPrompt(attempts[0].prompt, { ...attempts[0], index: 0 }, attempts), /Best attempt/);
});
