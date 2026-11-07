import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLibrary, preciseMatch, validateStyle } from '../lib.mjs';

test('broad names and different visual tags cannot trigger automatic grouping', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-tags-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const library = await createLibrary(dir);
  const broad = library.list()[0];
  const input = { name: broad.name, keywords: ['paper collage'], tags: ['flat paper', 'smooth surface', 'hard edges'], existingStyleId: broad.id };
  assert.equal(preciseMatch(library.list(), input), null);
  const flat = await library.add(input, { id: 'flat', sourceUrl: 'https://example.com/flat.png', tags: input.tags }, null);
  assert.notEqual(flat.id, broad.id);
  const textured = { ...input, tags: ['layered paper', 'rough texture', 'soft shadows'], existingStyleId: flat.id };
  assert.equal(preciseMatch(library.list(), textured), null);
  const separate = await library.add(textured, { id: 'textured' }, null);
  assert.notEqual(separate.id, flat.id);
  assert.equal(preciseMatch(library.list(), { ...input, existingStyleId: flat.id }), flat.id);
  const updated = await library.reclassify('flat', { ...textured, name: 'Layered paper diorama', existingStyleId: null });
  assert.equal(updated.images[0].sourceUrl, 'https://example.com/flat.png');
  assert.deepEqual(updated.images[0].tags, textured.tags);
  assert.equal(updated.id, flat.id, 'a sole image with no match relabels its own style');
  assert.equal(updated.name, 'Layered paper diorama');
  const reloaded = await createLibrary(dir);
  assert.deepEqual(reloaded.list().find(s => s.id === updated.id).tags, textured.tags);
  assert.equal(reloaded.list().flatMap(s => s.images).length, 2);
});

test('tag validation and same-name edits preserve distinct treatments', async t => {
  assert.throws(() => validateStyle({ name: 'Test', keywords: ['test'], tags: [''] }), /tags/);
  const dir = await mkdtemp(join(tmpdir(), 'artbook-edit-tags-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const library = await createLibrary(dir);
  const a = await library.add({ name: 'Paper art', keywords: ['paper'], tags: ['flat'] }, { id: 'a' }, null);
  const b = await library.add({ name: 'Paper diorama', keywords: ['paper'], tags: ['dimensional'] }, { id: 'b' }, null);
  await library.edit(b.id, { name: a.name, keywords: ['paper'], tags: ['dimensional'] });
  assert.equal(library.list().filter(s => s.name === a.name).length, 2);
});

test('visual match from analyzer groups differently worded results into the chosen collection', async t => {
  const { resolveMatch } = await import('../lib.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'artbook-visual-match-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const library = await createLibrary(dir);
  const front = await library.add({ name: 'Semi-realistic cinematic 3D', keywords: ['cinematic 3d'], tags: ['3d render', 'realistic skin', 'soft lighting'] }, { id: 'front' }, null);
  const side = { name: 'Stylized cinematic 3D', keywords: ['stylized 3d'], tags: ['3d render', 'sculpted hair', 'rim lighting'], existingStyleId: front.id };
  assert.equal(resolveMatch(library.list(), side), front.id);
  assert.equal(resolveMatch(library.list(), { ...side, existingStyleId: 'missing' }), null);
  const grouped = await library.add(side, { id: 'side' }, resolveMatch(library.list(), side));
  assert.equal(grouped.id, front.id);
  assert.equal(grouped.name, 'Semi-realistic cinematic 3D');
  assert.equal(grouped.images.length, 2);
});

test('image details are trimmed, bounded and saved on reclassification', async t => {
  const { validateImageDetails } = await import('../lib.mjs');
  assert.deepEqual(validateImageDetails(undefined), { title: null, description: null, imagePrompt: null, stylePrompt: null });
  const details = validateImageDetails({ title: '  The Gleaners ', description: null, imagePrompt: 'x'.repeat(2000), stylePrompt: '[a lighthouse]  oil painting' });
  assert.equal(details.title, 'The Gleaners');
  assert.equal(details.description, null);
  assert.equal(details.imagePrompt.length, 1500);
  assert.equal(details.stylePrompt, '[a lighthouse] oil painting');
  const dir = await mkdtemp(join(tmpdir(), 'artbook-details-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const library = await createLibrary(dir);
  const style = await library.add({ name: 'Oil realism', keywords: ['oil'], tags: ['oil paint', 'naturalism', 'soft light'] }, { id: 'p1' }, null);
  await library.reclassify('p1', { name: 'Oil realism', keywords: ['oil'], tags: ['oil paint', 'naturalism', 'soft light'], existingStyleId: style.id, details });
  assert.equal(library.list().find(s => s.id === style.id).images[0].title, 'The Gleaners');
});

test('re-identifying the only image of a style relabels that style instead of leaving it empty', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'artbook-solo-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const library = await createLibrary(dir);
  const solo = await library.add({ name: 'Bold-line flat cartoon', keywords: ['cartoon'], tags: ['bold outlines', 'flat color', '2d'] }, { id: 'solo' }, null);
  const before = library.list().length;
  const result = await library.reclassify('solo', { name: 'Bold-outline flat cartoon', keywords: ['comic'], tags: ['bold outlines', 'flat fills', '2d'], existingStyleId: null });
  assert.equal(result.id, solo.id);
  assert.equal(result.name, 'Bold-outline flat cartoon');
  assert.equal(result.images.length, 1);
  assert.equal(library.list().length, before);
});
