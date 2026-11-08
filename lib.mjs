import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const seeds = [
  ['Cut-paper collage', ['cut paper illustration', 'paper cutout animation', 'layered paper collage']],
  ['Ink-and-wash 2D', ['ink and wash illustration', 'watercolor ink animation', 'sumi-e animation']],
  ['Felt stop-motion', ['needle felt animation', 'felt puppet stop motion', 'wool character animation']],
  ['Clay stop-motion', ['claymation', 'plasticine animation', 'clay stop motion']],
  ['Risograph illustration', ['risograph illustration', 'riso print texture', 'two color print illustration']],
  ['Woodcut illustration', ['woodcut illustration', 'linocut animation', 'relief print art']],
  ['Gouache illustration', ['gouache illustration', 'opaque watercolor painting', 'gouache animation background']],
  ['Pixel art', ['pixel art animation', 'pixel art landscape', 'animated pixel illustration']],
  ['Cel animation', ['hand drawn cel animation', 'traditional 2D animation', 'painted animation background']],
  ['Scratchboard illustration', ['scratchboard art', 'scratchboard animation', 'white on black illustration']],
  ['Low-poly 3D', ['low poly illustration', 'low poly animation', 'stylized low poly environment']],
  ['Charcoal illustration', ['charcoal drawing animation', 'charcoal illustration', 'smudged charcoal art']],
];

const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function validateTags(tags = []) {
  if (!Array.isArray(tags) || tags.length > 12 || tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 60)) throw new Error('Use up to 12 tags, each 1–60 characters.');
  return [...new Set(tags.map(tag => tag.trim().toLowerCase()))];
}
export function preciseMatch(styles, result) {
  const tags = validateTags(result.tags);
  const style = styles.find(s => s.id === result.existingStyleId);
  return style && tags.length >= 3 && normalize(style.name) === normalize(result.name) &&
    tags.length === (style.tags || []).length && tags.every(tag => style.tags.includes(tag)) ? style.id : null;
}
// Accepts the analyzer's visual match when it names a real collection; otherwise falls back to the exact-metadata guard.
export function resolveMatch(styles, result) {
  return result.existingStyleId && styles.some(s => s.id === result.existingStyleId) ? result.existingStyleId : preciseMatch(styles, result);
}
const text = (value, max) => typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ').slice(0, max) : null;
// Per-image reference details from analysis. Missing or unknown values are null and hidden in the UI.
export function validateImageDetails(value = {}) {
  return {
    title: text(value?.title, 120),
    description: text(value?.description, 400),
    imagePrompt: text(value?.imagePrompt, 1500),
    stylePrompt: text(value?.stylePrompt, 1500),
  };
}
// Only positive findings are stored; anything else is null (shown as nothing).
export function validateAiOrigin(value) {
  return value && ['confirmed', 'likely'].includes(value.status) && typeof value.evidence === 'string' ? { status: value.status, evidence: value.evidence.slice(0, 120) } : null;
}
// Style traits a test generation is rated on, each 0–100; the similarity is their rounded mean.
export const STYLE_TRAITS = ['palette', 'linework', 'rendering', 'texture', 'lighting', 'shapes'];
export function validateJudgement(value) {
  const scores = Object.fromEntries(STYLE_TRAITS.map(trait => {
    const score = Number(value?.scores?.[trait]);
    if (!Number.isFinite(score)) throw new Error('The style comparison came back incomplete. Try again.');
    return [trait, Math.max(0, Math.min(100, Math.round(score)))];
  }));
  const similarity = Math.round(STYLE_TRAITS.reduce((sum, trait) => sum + scores[trait], 0) / STYLE_TRAITS.length);
  const differences = (Array.isArray(value?.differences) ? value.differences : []).map(d => text(d, 240)).filter(Boolean).slice(0, 6);
  return { similarity, scores, differences, summary: text(value?.summary, 400) };
}
// A test prompt carries the palette line the interface appends to every prompt; the stored style prompt does not.
export const stylePromptOf = prompt => text(String(prompt).replace(/\s*Color palette:[^]*$/i, ''), 1500);
// The generator gets the subject as plain words: "[a fox] ink lines" becomes "a fox, ink lines". Stored prompts keep the brackets.
export const promptForGenerator = prompt => String(prompt).replace(/^\s*\[([^\]]*)\]\s*[,.:;]?\s*/, (_, subject) => subject.trim() ? `${subject.trim()}. ` : '').replace(/\[([^\]]*)\]/g, '$1');
const GENERATED_FILE =/^[a-f0-9-]{8,64}\.(png|jpg|webp)$/;
export const MAX_TEST_ATTEMPTS = 8;
// One attempt of a test: the generated file, the prompt that made it, its judgement, and what changed from the attempt before.
export function validateAttempt(attempt) {
  if (!GENERATED_FILE.test(attempt?.filename || '')) throw new Error('Invalid generated image.');
  const prompt = text(attempt.prompt, 2500);
  if (!prompt) throw new Error('Invalid generation prompt.');
  // basedOn: index of the attempt whose prompt was reworked into this one (null for a test's first attempt, or older records).
  const basedOn = Number.isInteger(attempt.basedOn) && attempt.basedOn >= 0 ? attempt.basedOn : null;
  return { filename: attempt.filename, prompt, change: text(attempt.change, 400) || null, basedOn, ...validateJudgement(attempt) };
}
// A test generation: attempts made from a prompt alone, each rated against the original image. The first run makes
// one or two; "Try again" adds refined attempts up to MAX_TEST_ATTEMPTS.
export function validateGeneration(value) {
  const raw = (Array.isArray(value?.attempts) ? value.attempts : []).slice(0, MAX_TEST_ATTEMPTS);
  // Older records kept the single refinement note on the test rather than on its second attempt.
  if (raw[1] && !raw[1].change && value.recalibration) raw[1] = { ...raw[1], change: value.recalibration };
  const attempts = raw.map(validateAttempt);
  if (!attempts.length) throw new Error('A generation needs at least one image.');
  return { id: typeof value.id === 'string' && /^[\w-]{8,64}$/.test(value.id) ? value.id : randomUUID(), createdAt: text(value.createdAt, 40) || new Date().toISOString(), target: Number.isFinite(value.target) ? value.target : null, attempts, error: text(value.error, 300) };
}
export function validateStyle(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 || /[\r\n.!?]/.test(value.name)) throw new Error('Use a short style name, up to 80 characters, without sentences.');
  if (!Array.isArray(value.keywords) || value.keywords.length < 1 || value.keywords.length > 8 || value.keywords.some(k => typeof k !== 'string' || !k.trim() || k.length > 100)) throw new Error('Add 1–8 search keywords, each up to 100 characters.');
  return { name: value.name.trim(), keywords: [...new Set(value.keywords.map(k => k.trim()))], tags: validateTags(value.tags) };
}

export async function createLibrary(directory) {
  await mkdir(join(directory, 'images'), { recursive: true });
  const file = join(directory, 'library.json');
  let state;
  try { state = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = { styles: seeds.map(([name, keywords]) => ({ id: randomUUID(), name, keywords, images: [] })) };
    await writeFile(file, JSON.stringify(state, null, 2));
  }
  let queue = Promise.resolve();
  function change(fn) {
    const result = queue.then(async () => {
      const next = structuredClone(state);
      const value = fn(next);
      await writeFile(`${file}.tmp`, JSON.stringify(next, null, 2));
      await rename(`${file}.tmp`, file);
      state = next;
      return value;
    });
    queue = result.catch(() => {});
    return result;
  }
  return {
    list: () => structuredClone(state.styles),
    add: (input, image, matchId) => change(next => {
      const clean = validateStyle(input);
      let style = next.styles.find(s => s.id === matchId) || (matchId === undefined && next.styles.find(s => normalize(s.name) === normalize(clean.name) && clean.tags.length === (s.tags || []).length && clean.tags.every(tag => s.tags.includes(tag))));
      if (!style) { style = { id: randomUUID(), ...clean, images: [] }; next.styles.push(style); }
      style.keywords = [...new Set([...style.keywords, ...clean.keywords])].slice(0, 8);
      if (image) style.images.push(image);
      return style;
    }),
    edit: (id, input) => change(next => {
      const clean = validateStyle(input);
      const style = next.styles.find(s => s.id === id);
      if (!style) throw new Error('Style not found.');
      const other = next.styles.find(s => s.id !== id && normalize(s.name) === normalize(clean.name) && clean.tags.length === (s.tags || []).length && clean.tags.every(tag => s.tags.includes(tag)));
      if (other) {
        other.images.push(...style.images);
        other.keywords = [...new Set([...other.keywords, ...clean.keywords])].slice(0, 8);
        next.styles = next.styles.filter(s => s.id !== id);
        return other;
      }
      Object.assign(style, clean);
      return style;
    }),
    setAiOrigin: (imageId, value) => change(next => {
      const image = next.styles.flatMap(s => s.images).find(i => i.id === imageId);
      if (image) image.aiOrigin = image.aiOrigin?.status === 'confirmed' ? image.aiOrigin : validateAiOrigin(value);
    }),
    removeStyle: id => change(next => {
      const style = next.styles.find(s => s.id === id);
      if (!style) throw new Error('Style not found.');
      if (style.images.length) throw new Error('Only empty styles can be deleted. Move or delete its images first.');
      next.styles = next.styles.filter(s => s.id !== id);
      return { id, name: style.name };
    }),
    removeImage: imageId => change(next => {
      const source = next.styles.find(s => s.images.some(i => i.id === imageId));
      if (!source) throw new Error('Image not found.');
      const image = source.images.find(i => i.id === imageId);
      source.images = source.images.filter(i => i.id !== imageId);
      return { style: source, image };
    }),
    move: (imageId, targetId) => change(next => {
      const target = next.styles.find(s => s.id === targetId);
      const source = next.styles.find(s => s.images.some(i => i.id === imageId));
      if (!target || !source) throw new Error('Image or destination style not found.');
      if (source.id !== target.id) {
        const image = source.images.find(i => i.id === imageId);
        source.images = source.images.filter(i => i.id !== imageId);
        target.images.push(image);
      }
      return target;
    }),
    addGeneration: (imageId, generation) => change(next => {
      const style = next.styles.find(s => s.images.some(i => i.id === imageId));
      if (!style) throw new Error('Image not found.');
      const image = style.images.find(i => i.id === imageId);
      image.generations = [...(image.generations || []), validateGeneration(generation)];
      return style;
    }),
    // Appends a refined attempt to an existing test; a successful attempt clears the test's earlier error.
    addAttempt: (imageId, generationId, attempt) => change(next => {
      const style = next.styles.find(s => s.images.some(i => i.id === imageId));
      const generation = style?.images.find(i => i.id === imageId)?.generations?.find(g => g.id === generationId);
      if (!generation) throw new Error('Generation not found.');
      if (generation.attempts.length >= MAX_TEST_ATTEMPTS) throw new Error(`A test keeps at most ${MAX_TEST_ATTEMPTS} attempts.`);
      generation.attempts = [...generation.attempts, validateAttempt(attempt)];
      generation.error = null;
      return style;
    }),
    // Makes a refined test prompt the image's style prompt. Only prompts stored with a test can be applied.
    useGenerationPrompt: (imageId, generationId, index) => change(next => {
      const style = next.styles.find(s => s.images.some(i => i.id === imageId));
      const image = style?.images.find(i => i.id === imageId);
      const attempt = image?.generations?.find(g => g.id === generationId)?.attempts[index];
      if (!attempt) throw new Error('Generation not found.');
      const prompt = stylePromptOf(attempt.prompt);
      if (!prompt) throw new Error('This prompt is empty.');
      image.stylePrompt = prompt;
      return style;
    }),
    removeGeneration: (imageId, generationId) => change(next => {
      const style = next.styles.find(s => s.images.some(i => i.id === imageId));
      const image = style?.images.find(i => i.id === imageId);
      const generation = image?.generations?.find(g => g.id === generationId);
      if (!generation) throw new Error('Generation not found.');
      image.generations = image.generations.filter(g => g.id !== generationId);
      return { style, generation };
    }),
    reclassify: (imageId, input) => change(next => {
      const source = next.styles.find(s => s.images.some(i => i.id === imageId));
      if (!source) throw new Error('Image not found.');
      const clean = validateStyle(input);
      const matchId = resolveMatch(next.styles, input);
      let target = next.styles.find(s => s.id === matchId);
      // A style's only image has nothing to be compared with, so with no match elsewhere the style itself is
      // relabelled instead of spawning a near-duplicate style and leaving this one empty.
      if (!target && source.images.length === 1) { target = source; Object.assign(source, clean); }
      if (!target) { target = { id: randomUUID(), ...clean, images: [] }; next.styles.push(target); }
      const image = source.images.find(i => i.id === imageId);
      image.tags = clean.tags;
      if (input.details) Object.assign(image, validateImageDetails(input.details));
      if ('aiOrigin' in input) image.aiOrigin = validateAiOrigin(input.aiOrigin);
      if (source.id !== target.id) {
        source.images = source.images.filter(i => i.id !== imageId);
        target.images.push(image);
      }
      return target;
    }),
  };
}

export function imageExtension(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'jpg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  throw new Error('Choose a PNG, JPEG, or WebP image.');
}
