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
  // Notes keep their raw index so evidence can point at them even when blank notes are dropped.
  const notes = (list, max) => {
    const raw = (Array.isArray(list) ? list : []).map(d => text(d, 240));
    const kept = raw.map((d, n) => d ? n : -1).filter(n => n >= 0).slice(0, max);
    return { values: kept.map(n => raw[n]), kept };
  };
  const differences = notes(value?.differences, 6), strengths = notes(value?.strengths, 4);
  const evidence = [
    ...validateEvidence((Array.isArray(value?.evidence) ? value.evidence : []).filter(e => (e?.list ?? 'differences') === 'differences'), differences.values, differences.kept, 'differences'),
    ...validateEvidence((Array.isArray(value?.evidence) ? value.evidence : []).filter(e => e?.list === 'strengths'), strengths.values, strengths.kept, 'strengths'),
  ];
  return { similarity, scores, differences: differences.values, strengths: strengths.values, evidence, summary: text(value?.summary, 400) };
}
// Where the critic looked: for a note (a difference or a strength), the words that name the element and a region on
// each image (fractions of width and height). A phrase must appear in its note; regions are clamped inside the image.
function validateEvidence(list, differences, kept, listName) {
  const region = b => {
    const n = k => Math.max(0, Math.min(1, Number(b?.[k])));
    if (!['x', 'y', 'w', 'h'].every(k => Number.isFinite(Number(b?.[k])))) return null;
    const w = Math.max(0.04, n('w')), h = Math.max(0.04, n('h'));
    return { x: Math.min(n('x'), 1 - w), y: Math.min(n('y'), 1 - h), w, h };
  };
  const seen = new Set();
  return (Array.isArray(list) ? list : []).flatMap(item => {
    const index = kept.indexOf(item?.difference);
    const phrase = text(item?.phrase, 80);
    if (index < 0 || !phrase || seen.has(index) || !differences[index].toLowerCase().includes(phrase.toLowerCase())) return [];
    const original = region(item.original), generated = region(item.generated);
    if (!original || !generated) return [];
    seen.add(index);
    return [{ list: listName, difference: index, phrase, original, generated }];
  }).slice(0, 6);
}
// A test prompt carries the palette line and any framing sentence the interface adds; the stored style prompt does not.
export const stylePromptOf = prompt => text(String(prompt).replace(/\s*Color palette:[^]*$/i, '').replace(/\s*Framing:[^.]*\./i, ''), 1500);
// The generator gets the subject as plain words: "[a fox] ink lines" becomes "a fox. ink lines". Stored prompts keep the brackets.
export const promptForGenerator = prompt => String(prompt).replace(/^\s*\[([^\]]*)\]\s*[,.:;]?\s*/, (_, subject) => subject.trim() ? `${subject.trim()}. ` : '').replace(/\[([^\]]*)\]/g, '$1');
const GENERATED_FILE =/^[a-f0-9-]{8,64}\.(png|jpg|webp)$/;
const SVG_FILE = /^[a-f0-9-]{8,64}\.svg$/;
export const DRAWERS = ['claude', 'codex'];
// Vector drawings are written by a text model as SVG code. They are cleaned before they are saved, rendered or served:
// only drawing markup and inline styles stay (no scripts, embedded HTML, external links, raster images or event handlers).
export const MAX_SVG = 600 * 1024;
export function sanitizeSvg(raw) {
  const found = String(raw ?? '').match(/<svg[\s>][\s\S]*<\/svg>/i);
  if (!found) throw new Error('The drawing came back without an SVG. Try again.');
  let svg = found[0];
  if (svg.length > MAX_SVG) throw new Error('The drawing was too large to save. Try again.');
  svg = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!(?:DOCTYPE|ENTITY)[\s\S]*?>/gi, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<(script|foreignObject|iframe|object|embed|audio|video|image|a)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|foreignObject|iframe|object|embed|audio|video|image|a)\b[^>]*\/?>/gi, '')
    .replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s((?:xlink:)?href)\s*=\s*("([^"]*)"|'([^']*)')/gi, (all, _name, _q, a, b) => (a ?? b ?? '').trim().startsWith('#') ? all : '')
    .replace(/url\(\s*(['"]?)\s*(?!#)[^)]*\)/gi, 'none');
  if (/<script|<foreignObject|javascript:|@import/i.test(svg)) throw new Error('The drawing contained unsafe content. Try again.');
  if (!/^<svg[^>]*\sxmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(svg)) svg = svg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return svg;
}
// The drawing's size from its viewBox (or width/height), for rendering; bounded so a render stays practical.
export function svgSize(svg) {
  const box = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  let w = Number(box?.[1]), h = Number(box?.[2]);
  if (!(w > 0 && h > 0)) { w = Number(svg.match(/<svg[^>]*\swidth=["']([\d.]+)/i)?.[1]); h = Number(svg.match(/<svg[^>]*\sheight=["']([\d.]+)/i)?.[1]); }
  if (!(w > 0 && h > 0)) { w = 1536; h = 1024; }
  const long = Math.max(w, h), scale = Math.min(2048, Math.max(1536, long)) / long; // long side 1536-2048 px
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}
export const MAX_TEST_ATTEMPTS = 8;
// One attempt of a test: the generated file, the prompt that made it, its judgement, and what changed from the attempt before.
export function validateAttempt(attempt) {
  if (!GENERATED_FILE.test(attempt?.filename || '')) throw new Error('Invalid generated image.');
  const prompt = text(attempt.prompt, 2500);
  if (!prompt) throw new Error('Invalid generation prompt.');
  // basedOn: index of the attempt whose prompt was reworked into this one (null for a test's first attempt, or older records).
  const basedOn = Number.isInteger(attempt.basedOn) && attempt.basedOn >= 0 ? attempt.basedOn : null;
  // A vector attempt keeps its SVG and, for a staged drawing, every stage with the drawer's note; filename is its render.
  const vector = attempt.kind === 'vector' && SVG_FILE.test(attempt.svg || '') ? {
    kind: 'vector', drawer: DRAWERS.includes(attempt.drawer) ? attempt.drawer : null, svg: attempt.svg,
    stages: (Array.isArray(attempt.stages) ? attempt.stages : []).filter(st => SVG_FILE.test(st?.filename || '')).slice(0, 6).map(st => ({ filename: st.filename, render: GENERATED_FILE.test(st.render || '') ? st.render : null, note: text(st.note, 400), layers: (Array.isArray(st.layers) ? st.layers : []).filter(l => ['sketch', 'color', 'line', 'finish'].includes(l)) })),
  } : {};
  return { filename: attempt.filename, prompt, change: text(attempt.change, 400) || null, basedOn, ...vector, ...validateJudgement(attempt) };
}
// A test generation: attempts made from a prompt alone, each rated against the original image. The first run makes
// one or two; "Try again" adds refined attempts up to MAX_TEST_ATTEMPTS.
export function validateGeneration(value) {
  const raw = (Array.isArray(value?.attempts) ? value.attempts : []).slice(0, MAX_TEST_ATTEMPTS);
  // Older records kept the single refinement note on the test rather than on its second attempt.
  if (raw[1] && !raw[1].change && value.recalibration) raw[1] = { ...raw[1], change: value.recalibration };
  const attempts = raw.map(validateAttempt);
  if (!attempts.length) throw new Error('A generation needs at least one image.');
  const vector = value.mode === 'vector' ? { mode: 'vector', drawer: DRAWERS.includes(value.drawer) ? value.drawer : null } : {};
  return { id: typeof value.id === 'string' && /^[\w-]{8,64}$/.test(value.id) ? value.id : randomUUID(), createdAt: text(value.createdAt, 40) || new Date().toISOString(), target: Number.isFinite(value.target) ? value.target : null, ...vector, attempts, error: text(value.error, 300) };
}
// An identification check: proposed changes to the style name, tags and collection of one image, each with a
// confidence and a reason. Only real changes are kept as proposals; the user applies or dismisses each one.
const CONFIDENCE = ['high', 'medium', 'low'];
export function validateReview(raw, { style, image, styles }) {
  const field = (value, extra) => ({ change: true, confidence: CONFIDENCE.includes(value?.confidence) ? value.confidence : 'low', reason: text(value?.reason, 300), state: null, ...extra });
  const keep = value => ({ change: false, reason: text(value?.reason, 300) });
  let name = keep(raw?.name);
  if (raw?.name?.change) {
    try {
      const value = validateStyle({ name: raw.name.value, keywords: ['x'], tags: [] }).name;
      if (normalize(value) !== normalize(style.name)) name = field(raw.name, { from: style.name, value });
    } catch {}
  }
  let tags = keep(raw?.tags);
  if (raw?.tags?.change) {
    try {
      const value = validateTags((Array.isArray(raw.tags.value) ? raw.tags.value : []).filter(t => typeof t === 'string' && t.trim()).slice(0, 8));
      const from = image.tags || [];
      if (value.length >= 3 && (value.length !== from.length || value.some(t => !from.includes(t)))) tags = field(raw.tags, { from, value });
    } catch {}
  }
  let collection = keep(raw?.collection);
  if (raw?.collection?.change) {
    const target = styles.find(s => s.id === raw.collection.styleId && s.id !== style.id);
    // A new collection takes the proposed name, so it needs one.
    if (target) collection = field(raw.collection, { from: style.name, styleId: target.id, value: target.name });
    else if (raw.collection.styleId === null && name.change) collection = field(raw.collection, { from: style.name, styleId: null, value: name.value });
  }
  return { createdAt: new Date().toISOString(), styleId: style.id, name, tags, collection, summary: text(raw?.summary, 300) };
}
export const REVIEW_FIELDS = ['name', 'tags', 'collection'];
const sameTags = (a = [], b = []) => a.length === b.length && a.every(t => b.includes(t));
export const tagsFollow = (style, from) => style.images.length === 1 || sameTags(style.tags || [], from || []);

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
    // Stores the latest identification check of an image, replacing an earlier one.
    setReview: (imageId, review) => change(next => {
      const style = next.styles.find(s => s.images.some(i => i.id === imageId));
      if (!style) throw new Error('Image not found.');
      style.images.find(i => i.id === imageId).review = review;
      return style;
    }),
    // Applies or dismisses one proposal of the identification check. Name and collection proposals refer to the
    // collection the image was in when checked, so they are refused once the image has moved.
    resolveReview: (imageId, fieldName, action) => change(next => {
      const source = next.styles.find(s => s.images.some(i => i.id === imageId));
      if (!source) throw new Error('Image not found.');
      const image = source.images.find(i => i.id === imageId);
      const review = image.review, proposal = review?.[fieldName];
      if (!REVIEW_FIELDS.includes(fieldName) || !proposal?.change || proposal.state) throw new Error('This suggestion is no longer open.');
      if (!['apply', 'dismiss'].includes(action)) throw new Error('Choose apply or dismiss.');
      if (action === 'dismiss') { proposal.state = 'dismissed'; return source; }
      if (fieldName !== 'tags' && source.id !== review.styleId) throw new Error('This image changed collection after the check. Run the check again.');
      let result = source;
      if (fieldName === 'tags') {
        image.tags = proposal.value;
        // The collection's tags follow when they came from this image: it is the only image, or they are exactly its old tags.
        if (tagsFollow(source, proposal.from)) source.tags = proposal.value;
      } else if (fieldName === 'name') {
        source.name = validateStyle({ name: proposal.value, keywords: source.keywords, tags: source.tags || [] }).name;
        // Renaming the collection already gives the image this name; a new collection with the same name is moot.
        if (review.collection.change && review.collection.styleId === null && !review.collection.state) review.collection.state = 'dismissed';
      } else {
        let target = proposal.styleId ? next.styles.find(s => s.id === proposal.styleId) : null;
        if (proposal.styleId && !target) throw new Error('That collection no longer exists. Run the check again.');
        if (!target && source.images.length === 1) {
          // Its only image moving to a new collection is the same as renaming this one; no empty collection is left behind.
          source.name = validateStyle({ name: proposal.value, keywords: source.keywords, tags: source.tags || [] }).name;
          target = source;
        }
        if (!target) { target = { id: randomUUID(), ...validateStyle({ name: proposal.value, keywords: source.keywords, tags: image.tags || [] }), images: [] }; next.styles.push(target); }
        if (target !== source) { source.images = source.images.filter(i => i.id !== imageId); target.images.push(image); }
        // The name proposal described this image's own style: a new collection uses it; joining an existing one makes it moot.
        if (review.name.change && !review.name.state) review.name.state = proposal.styleId ? 'dismissed' : 'applied';
        review.styleId = target.id;
        result = target;
      }
      proposal.state = 'applied';
      return result;
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
      delete image.review; // a check of the previous identification no longer applies
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
