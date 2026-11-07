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
