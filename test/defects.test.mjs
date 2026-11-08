import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJudgement, validateAttempt } from '../lib.mjs';
import { refinementPrompt, drawPrompt } from '../server.mjs';

const scores = { palette: 70, linework: 60, rendering: 50, texture: 40, lighting: 60, shapes: 80 };

test('defects and model limits are kept apart from the style score', () => {
  const judged = validateJudgement({
    scores, summary: 'Close.', strengths: [], evidence: [],
    differences: ['smooth digital gradients; original has riso grain', '', 'thin contours'],
    defects: [
      { note: 'six fingers on the left hand', kind: 'anatomy', box: { x: 0.95, y: 0.2, w: 0.2, h: 0.01 }, fixable: 'unlikely' },
      { note: 'cup merges into the table', kind: 'oops', box: { x: 0.4, y: 0.5, w: 0.1, h: 0.1 }, fixable: 'likely' },
      { note: '', kind: 'text', box: { x: 0, y: 0, w: 1, h: 1 }, fixable: 'likely' },
      { note: 'no box', kind: 'text', fixable: 'likely' },
    ],
    // Raw indices: 0 is kept, 1 was blank (dropped), 2 becomes index 1; unknown indices are ignored.
    limits: [{ difference: 0, reason: 'generators smooth over print grain' }, { difference: 2, reason: 'hard to steer' }, { difference: 7, reason: 'x' }],
  });
  assert.equal(judged.similarity, 60);
  assert.deepEqual(judged.defects, [
    { note: 'six fingers on the left hand', kind: 'anatomy', box: { x: 0.8, y: 0.2, w: 0.2, h: 0.04 }, fixable: 'unlikely' },
    { note: 'cup merges into the table', kind: 'other', box: { x: 0.4, y: 0.5, w: 0.1, h: 0.1 }, fixable: 'likely' },
  ]);
  assert.deepEqual(judged.limits, [{ difference: 0, reason: 'generators smooth over print grain' }, { difference: 1, reason: 'hard to steer' }]);
  // Older judgements without them stay as they were.
  const old = validateJudgement({ scores, differences: ['a'], strengths: [], evidence: [], summary: '' });
  assert.equal('defects' in old, false);
  assert.equal('limits' in old, false);
  assert.deepEqual(validateAttempt({ filename: '0000000a-bbbb.png', prompt: 'p', ...judged }).defects, judged.defects);
});

test('the refiner fixes likely defects and knows which differences are probably limits', () => {
  const attempt = { scores, similarity: 60, prompt: 'p', differences: ['smooth gradients; original has riso grain', 'thin contours'], strengths: [],
    defects: [{ note: 'six fingers', kind: 'anatomy', box: { x: 0, y: 0, w: 0.2, h: 0.2 }, fixable: 'unlikely' }, { note: 'cup merges into table', kind: 'merged', box: { x: 0.4, y: 0.5, w: 0.1, h: 0.1 }, fixable: 'likely' }],
    limits: [{ difference: 0, reason: 'generators smooth over print grain' }] };
  const prompt = refinementPrompt('[a cafe] riso print', attempt, [attempt]);
  assert.match(prompt, /defects in the result \(not style; they do not affect the score[^\n]*\n- cup merges into table\n/);
  assert.doesNotMatch(prompt, /six fingers/);
  assert.match(prompt, /probably beyond what the generator can do[^\n]*\n- smooth gradients; original has riso grain \(generators smooth over print grain\)/);
  // A drawing's revision sees every defect with its place on the canvas.
  assert.match(drawPrompt({ brief: 'b', stage: null, previous: null, critique: attempt }), /- six fingers \(canvas x 0-307, y 0-205\)\n- cup merges into table \(canvas x 614-768, y 512-614\)/);
});
