import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLibrary, validateReview } from '../lib.mjs';
import { makeApp, reviewPrompt } from '../server.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const scores = { palette: 60, linework: 50, rendering: 60, texture: 60, lighting: 60, shapes: 60 };
const attempt = (name, differences, strengths = []) => ({ attempts: [{ filename: `${name}-bbbb.png`, prompt: '[a fox] ink', scores, differences, strengths }] });
const file = n => `0000000${n}-aaaa.png`;

async function serve(t, dataDir, review) {
  const server = await makeApp({ dataDir, status: async () => ({ connected: true }), review });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    post: (path, payload = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'X-Artbook-Request': '1' }, body: JSON.stringify(payload) }),
    styles: async () => (await fetch(`${base}/api/styles`)).json(),
    image: async id => (await (await fetch(`${base}/api/styles`)).json()).flatMap(s => s.images.map(i => ({ ...i, style: s }))).find(i => i.id === id),
  };
}

test('an identification check proposes name, tag and collection changes that are applied one by one', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-review-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const library = await createLibrary(dir);
  for (const n of [1, 2, 3]) await writeFile(join(dir, 'images', file(n)), png);
  const loose = await library.add({ name: 'Loose ink caricature', keywords: ['ink caricature'], tags: ['loose scratchy linework', 'ink wash', 'caricature'] }, { id: 'img-a', filename: file(1), tags: ['loose scratchy linework', 'ink wash', 'caricature'] });
  await library.add({ name: 'Loose ink caricature', keywords: ['ink'] }, { id: 'img-b', filename: file(2), tags: [] }, loose.id);
  const bold = await library.add({ name: 'Bold ink cartoon', keywords: ['ink cartoon'], tags: ['heavy contours'] }, { id: 'img-c', filename: file(3), tags: ['heavy contours'] });
  await library.addGeneration('img-a', attempt('0000000a', ['thin broken contours; original has continuous heavy outlines'], ['same warm washes']));
  const contexts = [];
  let answer = {
    name: { change: true, value: 'Bold contour caricature', confidence: 'high', reason: 'Outlines are heavy and continuous.' },
    tags: { change: true, value: ['heavy continuous contours', 'ink wash', 'caricature'], confidence: 'medium', reason: 'Linework is not scratchy.' },
    collection: { change: true, styleId: bold.id, confidence: 'medium', reason: 'Same heavy contours as that collection.' },
    summary: 'The linework was misread.' };
  const app = await serve(t, dir, async (original, context, job, { onThought }) => { contexts.push({ original, context, job }); onThought?.('Checking the outlines'); return answer; });

  // The check needs a test to learn from.
  assert.equal((await app.post('/api/images/img-c/review')).status, 400);
  assert.equal((await app.post('/api/images/img-a/review')).status, 200);
  const [{ original, context, job }] = contexts;
  assert.equal(original, join(dir, 'images', file(1)));
  assert.ok(job.startsWith(join(dir, 'review-')), 'the check works in the data directory');
  assert.deepEqual(context.notes, ['difference: thin broken contours; original has continuous heavy outlines', 'strength: same warm washes']);
  // The current collection is compared through another of its images, other collections through one example each.
  assert.deepEqual(context.candidates.map(c => [c.current || false, c.style.id, c.path]), [[true, loose.id, join(dir, 'images', file(2))], [false, bold.id, join(dir, 'images', file(3))]]);
  const text = reviewPrompt(context);
  assert.match(text, /style name \(the name of its collection\): "Loose ink caricature"/);
  assert.match(text, /- difference: thin broken contours/);
  assert.match(text, /Image 2: another image of the CURRENT collection\nImage 3: id [\w-]+, collection "Bold ink cartoon" \(heavy contours\)/);
  let review = (await app.image('img-a')).review;
  assert.equal(review.styleId, loose.id);
  assert.deepEqual([review.name.from, review.name.value, review.name.confidence, review.name.state], ['Loose ink caricature', 'Bold contour caricature', 'high', null]);
  assert.equal(review.collection.value, 'Bold ink cartoon');
  assert.equal(review.summary, 'The linework was misread.');

  // The collection's tags are exactly this image's old tags (they came from it), so they follow the change.
  assert.equal((await app.post('/api/images/img-a/review/tags', { action: 'apply' })).status, 200);
  let current = await app.image('img-a');
  assert.deepEqual(current.tags, ['heavy continuous contours', 'ink wash', 'caricature']);
  assert.deepEqual(current.style.tags, ['heavy continuous contours', 'ink wash', 'caricature']);
  // Moving to an existing collection makes the name proposal moot.
  assert.equal((await app.post('/api/images/img-a/review/collection', { action: 'apply' })).status, 200);
  current = await app.image('img-a');
  assert.equal(current.style.id, bold.id);
  assert.deepEqual([current.review.collection.state, current.review.name.state, current.review.tags.state], ['applied', 'dismissed', 'applied']);
  assert.equal((await app.post('/api/images/img-a/review/name', { action: 'apply' })).status, 400);
  assert.equal((await app.post('/api/images/img-a/review/tags', { action: 'bogus' })).status, 400);

  // Proposals that change nothing, point at the current collection or at a new one without a name are not offered.
  answer = { name: { change: false, value: 'Bold ink cartoon', confidence: 'high', reason: 'Fits.' }, tags: { change: true, value: ['ink wash', 'heavy continuous contours', 'caricature'], confidence: 'low', reason: 'Same.' },
    collection: { change: true, styleId: null, confidence: 'low', reason: 'Unsure.' }, summary: 'Labels hold.' };
  assert.equal((await app.post('/api/images/img-a/review')).status, 200);
  review = (await app.image('img-a')).review;
  assert.deepEqual([review.name.change, review.tags.change, review.collection.change], [false, false, false]);
});

test('a collection\'s only image moving to a new collection renames that collection instead', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-review-solo-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const library = await createLibrary(dir);
  await writeFile(join(dir, 'images', file(4)), png);
  const solo = await library.add({ name: 'Flat ink cartoon', keywords: ['flat'], tags: ['flat fills', 'ink', 'cartoon'] }, { id: 'img-d', filename: file(4), tags: ['flat fills', 'ink', 'cartoon'] });
  await library.addGeneration('img-d', attempt('0000000d', ['flat fills']));
  const app = await serve(t, dir, async () => ({ name: { change: true, value: 'Heavy contour cartoon', confidence: 'high', reason: 'Heavier.' }, tags: { change: true, value: ['heavy contours', 'flat fills', 'cartoon'], confidence: 'high', reason: 'Contours.' },
    collection: { change: true, styleId: null, confidence: 'medium', reason: 'Own style.' }, summary: 'New style.' }));
  assert.equal((await app.post('/api/images/img-d/review')).status, 200);
  // The only image's tags are the collection's tags.
  assert.equal((await app.post('/api/images/img-d/review/tags', { action: 'apply' })).status, 200);
  assert.equal((await app.post('/api/images/img-d/review/collection', { action: 'apply' })).status, 200);
  const styles = await app.styles();
  const renamed = styles.find(s => s.id === solo.id);
  assert.equal(renamed.name, 'Heavy contour cartoon');
  assert.deepEqual(renamed.tags, ['heavy contours', 'flat fills', 'cartoon']);
  assert.equal(styles.filter(s => s.name === 'Heavy contour cartoon').length, 1);
  assert.equal(renamed.images[0].review.name.state, 'applied');
});

test('an identification check is dropped when the image is identified again, and dismissing keeps the labels', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-review-lib-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const library = await createLibrary(dir);
  const style = await library.add({ name: 'Flat ink cartoon', keywords: ['flat'], tags: ['flat fills', 'ink', 'cartoon'] }, { id: 'img', filename: 'x.png', tags: ['flat fills', 'ink', 'cartoon'] });
  const review = validateReview({ name: { change: true, value: 'FLAT ink cartoon', confidence: 'high' }, tags: { change: true, value: ['flat fills', 'ink', 'cartoon', 'thick contours'], confidence: 'bogus' }, collection: { change: true, styleId: style.id } }, { style, image: style.images[0], styles: [style] });
  assert.equal(review.name.change, false, 'a name that only differs in case is not a change');
  assert.deepEqual([review.tags.change, review.tags.confidence], [true, 'low']);
  assert.equal(review.collection.change, false, 'the current collection is not a move');
  await library.setReview('img', review);
  await library.resolveReview('img', 'tags', 'dismiss');
  // In a shared collection whose tags differ from the image's, applying changes the image's tags only.
  const shared = await library.add({ name: 'Wash caricature', keywords: ['wash'], tags: ['ink wash', 'caricature', 'pale paper'] }, { id: 'one', filename: 'one.png', tags: ['ink wash', 'caricature', 'pale paper'] });
  await library.add({ name: 'Wash caricature', keywords: ['wash'] }, { id: 'two', filename: 'two.png', tags: ['ink wash', 'caricature', 'scratchy lines'] }, shared.id);
  const sharedNow = library.list().find(s => s.id === shared.id);
  await library.setReview('two', validateReview({ tags: { change: true, value: ['ink wash', 'caricature', 'heavy contours'], confidence: 'high' } }, { style: sharedNow, image: sharedNow.images[1], styles: [sharedNow] }));
  await library.resolveReview('two', 'tags', 'apply');
  const after = library.list().find(s => s.id === shared.id);
  assert.deepEqual(after.images[1].tags, ['ink wash', 'caricature', 'heavy contours']);
  assert.deepEqual(after.tags, ['ink wash', 'caricature', 'pale paper']);
  let stored = library.list().find(s => s.id === style.id).images[0];
  assert.deepEqual(stored.tags, ['flat fills', 'ink', 'cartoon']);
  assert.equal(stored.review.tags.state, 'dismissed');
  await library.reclassify('img', { name: 'Flat ink cartoon', keywords: ['flat'], tags: ['flat fills', 'ink', 'cartoon'], existingStyleId: style.id });
  stored = library.list().find(s => s.id === style.id).images[0];
  assert.equal(stored.review, undefined);
});
