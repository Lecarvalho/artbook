// Detects AI generation from evidence carried by the file itself. Only positive evidence counts:
// absence of markers proves nothing (Pinterest, screenshots and re-saving strip metadata).

// Generator names as they appear in C2PA claim generators, XMP/EXIF software fields and PNG text chunks.
const GENERATORS = [
  ['OpenAI', /\bOpenAI\b|ChatGPT|DALL[·\-.\s]?E/i],
  ['Adobe Firefly', /Adobe[_\s]?Firefly/i],
  ['Midjourney', /Midjourney/i],
  ['Stable Diffusion', /Stable[_\s-]?Diffusion|\bSDXL\b|AUTOMATIC1111/i],
  ['ComfyUI', /ComfyUI/i],
  ['Google Imagen', /\bImagen\b|Gemini/i],
  ['Microsoft Designer', /Microsoft Designer|Bing Image Creator/i],
  ['Meta AI', /Meta AI|Imagine with Meta/i],
  ['Leonardo.ai', /Leonardo\.?ai/i],
  ['Ideogram', /Ideogram/i],
  ['NovelAI', /NovelAI/i],
  ['Flux', /\bFLUX\.1\b|Black Forest Labs/i],
];

const generatorIn = text => GENERATORS.find(([, pattern]) => pattern.test(text))?.[0] || null;

// Returns { status: 'confirmed', evidence } or null. Scans the raw bytes as Latin-1 text, which is enough to
// find XMP packets, C2PA/JUMBF manifests, EXIF strings and PNG tEXt/iTXt chunks without full parsers.
export function detectAiMetadata(buffer) {
  if (!buffer?.length) return null;
  const text = buffer.toString('latin1');
  const hasC2pa = /c2pa/.test(text) && /jumb|jumd/.test(text);
  // IPTC digital source type, used both in XMP and inside C2PA actions.
  const sourceType = /compositeWithTrainedAlgorithmicMedia/.test(text) ? 'composite' : /trainedAlgorithmicMedia/.test(text) ? 'generated' : null;
  const generator = generatorIn(text);
  if (hasC2pa && (sourceType || generator)) {
    return { status: 'confirmed', evidence: `Content Credentials${generator ? ` (${generator})` : ''}${sourceType === 'composite' ? ', AI-edited' : ''}` };
  }
  if (sourceType) return { status: 'confirmed', evidence: `From image metadata${generator ? ` (${generator})` : ''}` };
  // Stable Diffusion WebUI and ComfyUI write their generation settings into PNG text chunks.
  if (/parameters\0[\s\S]{0,4000}Steps: \d+[\s\S]{0,400}Sampler:/.test(text)) return { status: 'confirmed', evidence: 'Generation settings in the file (Stable Diffusion)' };
  if (/(?:prompt|workflow)\0\{[\s\S]{0,2000}"class_type"/.test(text)) return { status: 'confirmed', evidence: 'Generation workflow in the file (ComfyUI)' };
  // A generator named in a software/creator field of the metadata.
  const field = text.match(/(?:Software|CreatorTool|creator_tool|claim_generator|Make)[^\n]{0,8}?([\x20-\x7e]{3,80})/g)?.join(' ') || '';
  const named = generatorIn(field);
  if (named) return { status: 'confirmed', evidence: `From image metadata (${named})` };
  return null;
}

// Combines file evidence with what the analysis saw. Confirmed beats likely; an earlier confirmation is never lost.
export function resolveAiOrigin({ metadata = null, watermark = null, previous = null } = {}) {
  if (metadata) return metadata;
  if (previous?.status === 'confirmed') return previous;
  const mark = typeof watermark === 'string' ? watermark.trim().slice(0, 60) : '';
  if (mark) return { status: 'likely', evidence: `Visible “${mark}” watermark` };
  return null;
}
