import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLibrary, validateNotes } from '../lib.mjs';
import { makeApp, refinementPrompt, drawPrompt, composeDrawing, parseDrawing, topElements, numberedDrawing, applyEdits, shapesUnder, regionWords } from '../server.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const scores = score => ({ palette: score, linework: score, rendering: score, texture: score, lighting: score, shapes: score });
const judgement = score => ({ scores: scores(score), differences: ['contours too even'], strengths: ['same warm paper'], summary: 'Close.' });
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
  const send = (method, path, payload) => fetch(`${base}${path}`, { method, headers: { 'X-Artbook-Request': '1' }, body: JSON.stringify(payload) });
  return { base, post: (path, payload) => send('POST', path, payload), put: (path, payload) => send('PUT', path, payload) };
}

test('notes keep a short text and an optional box clamped to the picture', () => {
  const [boxed, general, tiny] = validateNotes([
    { id: 'note-1', on: 'original', box: { x: 0.9, y: -0.2, w: 0.5, h: 0.4 }, text: '  softer   edges here ' },
    { text: 'keep the grain', on: 'generated' },
    { on: 'generated', box: { x: 0.5, y: 0.5, w: 0.001, h: 0.3 }, text: 'too small to keep the box' },
  ]);
  assert.deepEqual(boxed, { id: 'note-1', on: 'original', box: { x: 0.9, y: 0, w: 0.1, h: 0.4 }, text: 'softer edges here' });
  assert.deepEqual([general.on, general.box, general.text], [null, null, 'keep the grain']);
  assert.match(general.id, /^[\w-]{8,}$/);
  assert.deepEqual([tiny.on, tiny.box], [null, null]);
  assert.throws(() => validateNotes([{ text: '   ' }]), /Write the note/);
  assert.throws(() => validateNotes(Array.from({ length: 13 }, () => ({ text: 'x' }))), /at most 12/);
  assert.equal(regionWords({ x: 0.05, y: 0.7, w: 0.2, h: 0.2 }), 'bottom left area: x 5-25%, y 70-90%');
  assert.equal(regionWords({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }), 'center area: x 40-60%, y 40-60%');
});

test('the refinement puts the owner\'s notes before the critique and sees the attempt\'s image', () => {
  const attempt = { ...judgement(55), prompt: 'p', notes: [{ on: 'generated', box: { x: 0.6, y: 0.1, w: 0.2, h: 0.2 }, text: 'sky too saturated' }, { on: null, box: null, text: 'keep the paper' }] };
  const prompt = refinementPrompt('[a fox] ink wash', attempt, [attempt]);
  assert.match(prompt, /^The first attached image is an original reference; the second is the image the current prompt produced\./);
  assert.match(prompt, /take priority over the reviewer/);
  assert.match(prompt, /- "sky too saturated" \(on the generated image, top right area: x 60-80%, y 10-30%\)/);
  assert.match(prompt, /- "keep the paper" \(general note\)/);
  assert.match(prompt, /never mention notes, regions or images in the prompt/);
  // Without notes nothing changes: one attached image.
  assert.match(refinementPrompt('p', judgement(55), []), /^The attached image is an original reference\./);
  // Notes on other attempts stay in the history.
  const earlier = { ...judgement(50), prompt: 'a', notes: [{ on: 'original', box: { x: 0, y: 0, w: 0.3, h: 0.3 }, text: 'see the dry brush' }] };
  assert.match(refinementPrompt('b', { ...judgement(55), prompt: 'b' }, [earlier, { ...judgement(55), prompt: 'b' }]), /owner's note: "see the dry brush" \(on the original, top left area/);
});

test('notes are saved per attempt, and Try again hands them and the attempt\'s image to the refiner', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-notes-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await library(dir);
  const refined = [];
  const app = await serve(t, {
    dataDir: dir,
    generate: async () => png,
    judge: async () => judgement(80),
    recalibrate: async (_original, prompt, from, _job, _history, { generatedPath }) => { refined.push({ notes: from.notes, generatedPath }); return { prompt: `${prompt} refined`, changes: 'softer sky' }; },
  });
  let response = await app.post('/api/generate', { imageId: 'img', prompt: '[a fox] ink wash' });
  let generation = (await response.json()).images[0].generations[0];
  const path = `/api/images/img/generations/${generation.id}/attempts/0/notes`;

  response = await app.put(path, { notes: [{ on: 'generated', box: { x: 0.6, y: 0.1, w: 0.2, h: 0.2 }, text: 'sky too saturated' }] });
  assert.equal(response.status, 200);
  generation = (await response.json()).images[0].generations[0];
  assert.equal(generation.attempts[0].notes[0].text, 'sky too saturated');
  assert.equal((await app.put(`/api/images/img/generations/${generation.id}/attempts/5/notes`, { notes: [] })).status, 400);
  assert.equal((await app.put(path, { notes: [{ text: '' }] })).status, 400);

  response = await app.post(`/api/images/img/generations/${generation.id}/retry`, { from: 0 });
  assert.equal(response.status, 200);
  assert.deepEqual(refined[0].notes.map(n => n.text), ['sky too saturated']);
  assert.equal(refined[0].generatedPath, join(dir, 'images', 'generated', generation.attempts[0].filename));

  // An empty list removes the notes; the attempt keeps no notes field.
  generation = (await (await app.put(path, { notes: [] })).json()).images[0].generations[0];
  assert.equal('notes' in generation.attempts[0], false);
  const image = JSON.parse(await readFile(join(dir, 'library.json'), 'utf8')).styles.flatMap(s => s.images).find(i => i.id === 'img');
  assert.equal('notes' in image.generations[0].attempts[0], false);
});

test('shapes are numbered per layer, found under a box, and edited in place', () => {
  assert.deepEqual(topElements('<g><rect/></g>\n<path d="a>b"/>stray<circle r="1"></circle>'), ['<g><rect/></g>', '<path d="a>b"/>', '<circle r="1"></circle>']);
  const svg = composeDrawing({ defs: [], layers: { sketch: '<rect id="paper"/>', line: '<path id="a"/><path id="b"/><path id="c"/>' } });
  assert.match(numberedDrawing(svg), /<g id="layer-line">\n<!-- line #1 -->\n<path id="a"\/>\n<!-- line #2 -->\n<path id="b"\/>\n<!-- line #3 -->\n<path id="c"\/>\n<\/g>/);
  const { layers, touched } = applyEdits(parseDrawing(svg).layers, [
    { layer: 'line', replace: [3, 1], content: '<path id="new"/>' },
    { layer: 'color', replace: [], content: '<rect id="wash"/>' },
    { layer: 'finish', replace: [9], content: '' },
  ]);
  assert.equal(layers.line, '<path id="new"/>\n<path id="b"/>');
  assert.equal(layers.color, '<rect id="wash"/>');
  assert.equal(layers.sketch, '<rect id="paper"/>');
  assert.deepEqual(touched, ['color', 'line']);
  // The paper behind everything is never "under" a box; a small shape inside it is.
  const rects = { 'sketch-1': { x: 0, y: 0, w: 1536, h: 1024 }, 'line-2': { x: 1000, y: 120, w: 150, h: 150 }, 'color-1': { x: 100, y: 600, w: 300, h: 200 } };
  assert.deepEqual(shapesUnder(rects, { x: 0.62, y: 0.05, w: 0.2, h: 0.25 }), ['line-2']);
});

test('a drawing\'s Try again with notes edits only the shapes under the box', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-notes-vector-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await library(dir);
  const calls = [];
  const app = await serve(t, {
    dataDir: dir,
    measure: async svg => { calls.push({ measured: parseDrawing(svg).layers.line }); return { 'sketch-1': { x: 0, y: 0, w: 1536, h: 1024 }, 'line-2': { x: 1000, y: 120, w: 150, h: 150 } }; },
    draw: async ({ stage, notes, previous }) => {
      if (stage) return { content: stage === 3 ? '<path id="a"/><path id="b"/>' : `<rect id="s${stage}"/>`, defs: '', sketchOpacity: 1, note: `stage ${stage}` };
      calls.push({ notes, prompt: drawPrompt({ brief: 'x', stage: null, previous, critique: judgement(60), notes }) });
      return { edits: [{ layer: 'line', replace: [2], content: '<path id="softer"/>' }], defs: '', sketchOpacity: 1, note: 'softened the roofline' };
    },
  });
  let generation = (await (await app.post('/api/generate', { imageId: 'img', prompt: '[a house] ink', mode: 'vector', drawer: 'codex' })).json()).images[0].generations[0];
  await app.put(`/api/images/img/generations/${generation.id}/attempts/0/notes`, { notes: [{ on: 'generated', box: { x: 0.62, y: 0.05, w: 0.2, h: 0.25 }, text: 'roofline too stiff' }, { on: 'original', box: { x: 0, y: 0, w: 0.5, h: 0.5 }, text: 'see how loose it is' }] });
  const response = await app.post(`/api/images/img/generations/${generation.id}/retry`, { from: 0 });
  assert.equal(response.status, 200);
  generation = (await response.json()).images[0].generations[0];
  const asked = calls.find(c => c.notes);
  assert.deepEqual(asked.notes.map(n => n.shapes), [['line-2'], []]);
  assert.match(asked.prompt, /"roofline too stiff" \(on your drawing, canvas x 952-1260, y 51-307; shapes there: line #2\)/);
  assert.match(asked.prompt, /"see how loose it is" \(about the original artwork, which you cannot see\)/);
  assert.match(asked.prompt, /<!-- line #2 -->\n<path id="b"\/>/);
  const second = generation.attempts[1];
  assert.equal(second.change, 'softened the roofline (edited line)');
  const revised = parseDrawing(await readFile(join(dir, 'images', 'generated', second.svg), 'utf8'));
  assert.equal(revised.layers.line, '<path id="a"/>\n<path id="softer"/>');
  assert.equal(revised.layers.color, '<rect id="s2"/>');
});
