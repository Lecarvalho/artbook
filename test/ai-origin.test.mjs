import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAiMetadata, resolveAiOrigin } from '../ai-origin.mjs';
import { validateAiOrigin } from '../lib.mjs';

const file = text => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from(text, 'latin1'), Buffer.from([0, 1, 2, 255])]);

test('file metadata confirms AI generation only on positive markers', () => {
  assert.equal(detectAiMetadata(file('IHDR plain photo bytes')), null);
  assert.equal(detectAiMetadata(file('jumb c2pa claim_generator Leica Camera')), null, 'C2PA alone is not AI (cameras sign too)');
  assert.deepEqual(detectAiMetadata(file('jumb jumd c2pa claim_generator OpenAI-API trainedAlgorithmicMedia')), { status: 'confirmed', evidence: 'Content Credentials (OpenAI)' });
  assert.match(detectAiMetadata(file('jumb c2pa Adobe Photoshop compositeWithTrainedAlgorithmicMedia')).evidence, /AI-edited/);
  assert.match(detectAiMetadata(file('<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia')).evidence, /^From image metadata$/);
  assert.match(detectAiMetadata(file('tEXtparameters\0a cat, Steps: 30, Sampler: Euler a, CFG scale: 7')).evidence, /Stable Diffusion/);
  assert.equal(detectAiMetadata(file('tEXtSoftware\0Midjourney')).evidence, 'From image metadata (Midjourney)');
});

test('origin resolution prefers file proof, keeps confirmations and ignores empty watermarks', () => {
  const confirmed = { status: 'confirmed', evidence: 'Content Credentials' };
  assert.deepEqual(resolveAiOrigin({ metadata: confirmed, watermark: 'Meta AI' }), confirmed);
  assert.deepEqual(resolveAiOrigin({ watermark: 'Meta AI' }), { status: 'likely', evidence: 'Visible “Meta AI” watermark' });
  assert.deepEqual(resolveAiOrigin({ watermark: 'Meta AI', previous: confirmed }), confirmed);
  assert.equal(resolveAiOrigin({ watermark: '  ' }), null);
  assert.equal(resolveAiOrigin({}), null);
  assert.equal(validateAiOrigin({ status: 'unknown', evidence: 'x' }), null);
});
