import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLibrary, sanitizeSvg, svgSize } from '../lib.mjs';
import { makeApp, drawPrompt, claudeSubscription, composeDrawing, parseDrawing, completeElements, partialJsonString } from '../server.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const judgement = score => ({ scores: { palette: score, linework: score, rendering: score, texture: score, lighting: score, shapes: score }, differences: ['contours too even'], strengths: ['same warm paper'], summary: 'Close.' });
async function library(dir) {
  const lib = await createLibrary(dir);
  await writeFile(join(dir, 'images', '00000001-aaaa.png'), png);
  await lib.add({ name: 'Ink wash', keywords: ['ink'], tags: [] }, { id: 'img', filename: '00000001-aaaa.png', tags: [] });
  return lib;
}
async function serve(t, options) {
  const server = await makeApp({ status: async () => ({ connected: true }), drawerStatus: async () => ({ connected: true }), render: async (_svg, pngPath) => writeFile(pngPath, png), judge: async () => judgement(60), ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, post: (path, payload) => fetch(`${base}${path}`, { method: 'POST', headers: { 'X-Artbook-Request': '1' }, body: JSON.stringify(payload) }) };
}

test('drawings are cleaned of scripts, links and embedded content, and sized from their viewBox', () => {
  const svg = sanitizeSvg('Here it is: <svg viewBox="0 0 1536 1024" onload="x()"><style>.a{fill:#c9a255}</style><script>x()</script><foreignObject><div/></foreignObject><image href="a.png"/><use href="#p"/><use href="https://e/x#p"/><rect class="a" fill="url(https://e/p)" filter="url(#grain)"/></svg> done');
  assert.equal(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024"><style>.a{fill:#c9a255}</style><use href="#p"/><use/><rect class="a" fill="none" filter="url(#grain)"/></svg>');
  assert.throws(() => sanitizeSvg('no drawing here'), /without an SVG/);
  assert.throws(() => sanitizeSvg(`<svg>${'x'.repeat(700 * 1024)}</svg>`), /too large/);
  assert.deepEqual(svgSize(svg), { width: 1536, height: 1024 });
  assert.deepEqual(svgSize('<svg viewBox="0 0 4000 1000"></svg>'), { width: 2048, height: 512 });
  assert.deepEqual(svgSize('<svg viewBox="0 0 300 200"></svg>'), { width: 1536, height: 1024 });
});

test('Claude draws only through a subscription sign-in', () => {
  assert.equal(claudeSubscription({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' }), true);
  assert.equal(claudeSubscription({ loggedIn: true, authMethod: 'api_key', apiProvider: 'firstParty' }), false);
  assert.equal(claudeSubscription({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'bedrock' }), false);
  assert.equal(claudeSubscription({ loggedIn: false, authMethod: 'claude.ai' }), false);
});

test('layers stack into named groups and read back, and a fading sketch keeps its opacity', () => {
  const svg = composeDrawing({ defs: ['<filter id="color-wash"/>'], layers: { sketch: '<path d="M0 0"/>', line: '<g><path d="M1 1"/></g>' }, sketchOpacity: 0.2 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1536 1024"/);
  assert.match(svg, /<defs>\n<filter id="color-wash"\/>\n<\/defs>\n<g id="layer-sketch" opacity="0.2">\n<path d="M0 0"\/>\n<\/g>\n<g id="layer-line">\n<g><path d="M1 1"\/><\/g>\n<\/g>/);
  assert.doesNotMatch(svg, /layer-color/);
  const back = parseDrawing(svg);
  assert.deepEqual(back.layers, { sketch: '<path d="M0 0"/>', line: '<g><path d="M1 1"/></g>' });
  assert.equal(back.sketchOpacity, 0.2);
  assert.deepEqual(back.defs, ['<filter id="color-wash"/>']);
  // A drawing without layers becomes one finish layer.
  assert.deepEqual(parseDrawing('<svg viewBox="0 0 10 10"><defs><filter id="f"/></defs><rect/></svg>').layers, { finish: '<rect/>' });
});

test('a layer still being written shows only its complete elements', () => {
  assert.equal(completeElements('<path d="M0 0"/><g id="a"><circle r="2"/></g><path d="M5'), '<path d="M0 0"/><g id="a"><circle r="2"/></g>');
  assert.equal(completeElements('<g><circle r="2"/>'), '');
  assert.equal(completeElements('<path d="a>b"/><rect'), '<path d="a>b"/>');
  assert.equal(partialJsonString('{"note":"x","content":"<path d=\\"M0 0\\"/>\\n<g', 'content'), '<path d="M0 0"/>\n<g');
  assert.equal(partialJsonString('{"content":"abc\\', 'content'), 'abc');
  assert.equal(partialJsonString('{"note":"x"', 'content'), '');
});

test('a drawing prompt asks for one layer at a time; a revision asks for the layers to redraw', () => {
  const first = drawPrompt({ brief: 'a fox. ink and wash', stage: 1, previous: null });
  assert.match(first, /layer 1 of 4, "sketch"/);
  assert.match(first, /"""\na fox\. ink and wash\n"""/);
  assert.match(first, /start on an empty canvas/);
  assert.match(first, /<g id="layer-sketch">/);
  assert.match(first, /Start every id with "sketch-"/);
  const last = drawPrompt({ brief: 'a fox', stage: 4, previous: { svg: '<svg>prev</svg>' }, renderNote: 'its render is the attached image' });
  assert.match(last, /layer 4 of 4, "finish"/);
  assert.match(last, /lower it, or 0, when construction lines do not belong/);
  assert.match(last, /Drawing so far:\n"""\n<svg>prev<\/svg>\n"""$/);
  const revision = drawPrompt({ brief: 'a fox', stage: null, previous: { svg: '<svg>now</svg>' }, critique: judgement(50) });
  assert.match(revision, /- contours too even/);
  assert.match(revision, /redrawing only the layers they concern/);
  assert.match(revision, /never see that original/);
});

test('a vector test draws four stacked layers, keeps every stage, serves drawings inertly, and redraws layers on Try again', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-vector-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await library(dir);
  const draws = [];
  let claude = { connected: true }, scores = [55, 68];
  const layerOf = ['sketch', 'color', 'line', 'finish'];
  const app = await serve(t, { dataDir: dir, drawerStatus: async () => claude, judge: async () => judgement(scores.shift()),
    generate: async () => { throw new Error('the image generator is not used for drawings'); },
    draw: async ({ brief, stage, previous, critique, drawer, job, onThought, onPartial }) => {
      draws.push({ brief, stage, previous: previous?.svg || null, critique: critique?.differences || null, drawer, job });
      onThought?.(`Layer ${stage ?? 'revise'} thinking`);
      if (!stage) return { layers: [{ name: 'line', content: '<path id="fixed" onclick="x()"/>' }, { name: 'nope', content: '<rect/>' }], defs: '<filter id="line-fix-grain"/>', sketchOpacity: 0, note: 'heavier tapering contours' };
      const id = layerOf[stage - 1];
      onPartial?.(`{"defs":"","content":"<path id=\\"${id}-1\\"/><path id=\\"${id}-2`);
      return { content: `<path id="${id}-1"/><!-- ${id} --><circle r="${stage}"/>`, defs: stage === 2 ? `<filter id="color-wash"/>` : '', sketchOpacity: stage === 4 ? 0.3 : 1, note: `${id} note` };
    } });
  const files = async () => (await readdir(join(dir, 'images', 'generated'))).sort();

  assert.equal((await app.post('/api/generate', { imageId: 'img', prompt: '[a fox] ink and wash', mode: 'vector', drawer: 'gimp' })).status, 400);
  // Claude is refused unless its subscription sign-in is connected.
  claude = { connected: false, message: 'Run claude auth login and sign in with your Claude subscription to draw with Claude.' };
  let response = await app.post('/api/generate', { imageId: 'img', prompt: '[a fox] ink and wash', mode: 'vector', drawer: 'claude' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Claude subscription/);
  claude = { connected: true };

  response = await app.post('/api/generate', { imageId: 'img', prompt: '[a fox] ink and wash', mode: 'vector', drawer: 'claude' });
  assert.equal(response.status, 200);
  let generation = (await response.json()).images[0].generations[0];
  assert.deepEqual([generation.mode, generation.drawer, generation.attempts.length], ['vector', 'claude', 1]);
  // Four layers, each seeing the drawing so far; the drawer gets the brief without brackets, never the original.
  assert.deepEqual(draws.map(d => d.stage), [1, 2, 3, 4]);
  assert.ok(draws.every(d => d.brief === 'a fox. ink and wash' && d.drawer === 'claude' && d.job.startsWith(dir)));
  assert.equal(draws[0].previous, null);
  assert.match(draws[2].previous, /<g id="layer-sketch">[\s\S]*<g id="layer-color">/);
  const attempt = generation.attempts[0];
  assert.deepEqual([attempt.kind, attempt.similarity, attempt.prompt], ['vector', 55, '[a fox] ink and wash']);
  assert.deepEqual(attempt.stages.map(st => [st.note, st.layers]), [['sketch note', ['sketch']], ['color note', ['color']], ['line note', ['line']], ['finish note', ['finish']]]);
  assert.equal(attempt.svg, attempt.stages[3].filename);
  assert.equal(attempt.filename, attempt.stages[3].render);
  assert.equal((await files()).length, 8, 'four stage drawings and their renders');
  // The finished drawing has every layer as a named group, the shared defs, and the faded sketch.
  const final = await readFile(join(dir, 'images', 'generated', attempt.svg), 'utf8');
  assert.match(final, /<filter id="color-wash"\/>[\s\S]*<g id="layer-sketch" opacity="0.3">[\s\S]*<g id="layer-color">[\s\S]*<g id="layer-line">[\s\S]*<g id="layer-finish">/);
  assert.doesNotMatch(final, /<!--/);

  // Saved drawings are served as sandboxed images.
  const served = await fetch(`${app.base}/images/generated/${attempt.svg}`);
  assert.equal(served.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  assert.match(served.headers.get('content-security-policy'), /default-src 'none'.*sandbox/);

  // Try again redraws only the layers the critique concerns; unknown layers are ignored; the others stay.
  response = await app.post(`/api/images/img/generations/${generation.id}/retry`, { from: 0 });
  assert.equal(response.status, 200);
  generation = (await response.json()).images[0].generations[0];
  assert.equal(draws.at(-1).stage, null);
  assert.deepEqual(draws.at(-1).critique, ['contours too even']);
  const second = generation.attempts[1];
  assert.deepEqual([second.kind, second.basedOn, second.similarity, second.change], ['vector', 0, 68, 'heavier tapering contours (redrew line)']);
  const revised = parseDrawing(await readFile(join(dir, 'images', 'generated', second.svg), 'utf8'));
  assert.equal(revised.layers.line, '<path id="fixed"/>');
  assert.match(revised.layers.color, /color-1/);
  assert.equal(revised.sketchOpacity, 0);
  assert.equal((await files()).length, 10);

  // Deleting the test removes every drawing and render it owns.
  assert.equal((await fetch(`${app.base}/api/images/img/generations/${generation.id}`, { method: 'DELETE', headers: { 'X-Artbook-Request': '1' } })).status, 200);
  assert.deepEqual(await files(), []);
});

test('the drawing can be watched while it is written', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-vector-live-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await library(dir);
  let release, seen = null;
  const app = await serve(t, { dataDir: dir,
    draw: async ({ stage, onPartial }) => {
      if (stage === 2) { onPartial?.('{"defs":"","content":"<path id=\\"color-1\\"/><path id=\\"color-2'); await new Promise(resolve => { release = resolve; }); }
      return { content: `<path id="layer${stage}"/>`, defs: '', sketchOpacity: 1, note: '' };
    } });
  const running = app.post('/api/generate', { imageId: 'img', prompt: 'ink', mode: 'vector', drawer: 'codex' });
  while (!release) await new Promise(resolve => setTimeout(resolve, 10));
  const [job] = await (await fetch(`${app.base}/api/jobs`)).json();
  assert.equal(job.live, undefined, 'the polled state does not carry the drawing');
  assert.equal(job.liveLayer, 'color');
  const live = await fetch(`${app.base}/api/jobs/${job.id}/drawing`);
  assert.match(live.headers.get('content-security-policy'), /sandbox/);
  seen = await live.text();
  release();
  assert.equal((await running).status, 200);
  // The finished sketch layer plus the complete part of the color layer being written.
  assert.match(seen, /<g id="layer-sketch">\n<path id="layer1"\/>\n<\/g>\n<g id="layer-color">\n<path id="color-1"\/>\n<\/g>/);
  assert.equal((await fetch(`${app.base}/api/jobs/unknown-job-id/drawing`)).status, 404);
});

test('a layer that comes back empty is asked for once more; twice empty fails without leaving files', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-vector-retry-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await library(dir);
  const stages = [];
  let failing = false;
  const app = await serve(t, { dataDir: dir,
    draw: async ({ stage }) => { stages.push(stage); return (stages.length === 2 || (failing && stage === 3)) ? { content: '', defs: '', sketchOpacity: 1, note: '' } : { content: '<rect/>', defs: '', sketchOpacity: 1, note: '' }; } });
  assert.equal((await app.post('/api/generate', { imageId: 'img', prompt: 'ink', mode: 'vector', drawer: 'codex' })).status, 200);
  assert.deepEqual(stages, [1, 2, 2, 3, 4]);
  const before = (await readdir(join(dir, 'images', 'generated'))).length;
  failing = true;
  const response = await app.post('/api/generate', { imageId: 'img', prompt: 'ink', mode: 'vector', drawer: 'codex' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /came back empty/);
  assert.equal((await readdir(join(dir, 'images', 'generated'))).length, before);
  const styles = await (await fetch(`${app.base}/api/styles`)).json();
  assert.equal(styles.find(s => s.name === 'Ink wash').images[0].generations.length, 1);
});
