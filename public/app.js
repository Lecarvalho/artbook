const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let styles = [], view = 'all', selectedStyle = null, editingId = null, selectedImage = null, importTarget = null;
const symbols = [
  '<path d="M6 8h23v23H6zM14 15h23v23H14z"/>',
  '<path d="M8 33c9-3 3-19 15-23s14 5 9 11-21 1-15 16"/>',
  '<path d="M9 12h25v25H9zM14 7v34M22 7v34M30 7v34M5 18h33M5 26h33M5 34h33"/>',
  '<circle cx="21" cy="23" r="14"/><path d="M8 23h26M21 9c-9 8-9 20 0 28 9-8 9-20 0-28"/>',
  '<circle cx="16" cy="20" r="12"/><circle cx="28" cy="26" r="12"/>',
  '<path d="m7 34 24-24M7 26 16 17m0 21 22-22M8 18l8-8m8 28 14-14"/>',
];
const imageURL = image => `/images/${image.filename}`;
// Card cover: up to 4 newest references in a mosaic, so duplicates and the style's range are visible at a glance.
function coverMosaic(style) {
  const shown = style.images.slice(-4).reverse();
  const extra = style.images.length - shown.length;
  return `<div class="mosaic mosaic-${shown.length}">${shown.map((image, n) => `<span class="mosaic-tile"><img src="${imageURL(image)}" alt="${n ? '' : `${escape(style.name)} reference`}" loading="lazy">${extra && n === shown.length - 1 ? `<span class="mosaic-more">+${extra}</span>` : ''}</span>`).join('')}</div>`;
}
const links = query => {
  const q = encodeURIComponent(query);
  return { YouTube: `https://www.youtube.com/results?search_query=${q}`, Pinterest: `https://www.pinterest.com/search/pins/?q=${q}`, 'Google Images': `https://www.google.com/search?tbm=isch&q=${q}` };
};
async function api(path, options = {}) {
  let response;
  // A network failure (including the page unloading mid-request) is marked so tracked jobs are not forgotten.
  try { response = await fetch(path, { ...options, headers: { 'X-Artbook-Request': '1', ...options.headers } }); }
  catch { throw Object.assign(new Error('Lost connection to Artbook. Refresh to see the result.'), { network: true }); }
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed. Please try again.'), { duplicate: data.duplicate });
  return data;
}
const JOBS_KEY = 'artbook-jobs';
function trackedJobs() { try { return JSON.parse(sessionStorage.getItem(JOBS_KEY)) || []; } catch { return []; } }
function saveJobs(list) { try { sessionStorage.setItem(JOBS_KEY, JSON.stringify(list)); } catch {} }
function trackJob(record) { saveJobs([...trackedJobs().filter(j => j.id !== record.id), record]); return record; }
function untrackJob(id) { saveJobs(trackedJobs().filter(j => j.id !== id)); }
// crypto.randomUUID exists only in secure contexts (https or localhost); a phone on the LAN uses plain http.
const newJobId = () => crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
// navigator.clipboard is also secure-context only; fall back to a temporary selection for LAN devices.
async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = Object.assign(document.createElement('textarea'), { value: text });
  area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  (document.querySelector('dialog[open]') || document.body).append(area);
  area.select();
  const ok = document.execCommand('copy'); area.remove();
  if (!ok) throw new Error('Copy failed');
}
async function refresh() { styles = await api('/api/styles'); render(); }
function render() {
  const collected = styles.filter(s => s.images.length);
  $('#all-count').textContent = styles.length;
  $('#collected-count').textContent = collected.length;
  $('#empty-count').textContent = styles.length - collected.length;
  $('#total-references').textContent = `${styles.reduce((n, s) => n + s.images.length, 0)} references saved`;
  $('#view-title').textContent = { all: 'All styles', collected: 'My references', empty: 'To explore' }[view];
  const query = $('#search').value.toLowerCase().trim();
  const filtered = styles.filter(s => (view === 'all' || (view === 'collected' ? s.images.length > 0 : !s.images.length)) && `${s.name} ${s.keywords.join(' ')} ${(s.tags || []).join(' ')} ${s.images.flatMap(i => i.tags || []).join(' ')}`.toLowerCase().includes(query));
  filtered.sort((a, b) => Number(!!b.images.length) - Number(!!a.images.length));
  $('#view-count').textContent = `${filtered.length} styles`;
  $('#gallery').innerHTML = filtered.map(s => {
    const index = styles.indexOf(s), image = s.images.at(-1);
    return `<article class="style-card"><button class="card-open" data-style="${s.id}" aria-label="Open ${escape(s.name)}"><div class="cover ${image ? '' : `cover-empty tone-${index % 6}`}">${image ? coverMosaic(s) : `<svg viewBox="0 0 44 44" aria-hidden="true">${symbols[index % 6]}</svg><span class="specimen-name">${escape(s.name)}</span>`}<span class="cover-count">${image ? `${s.images.length} reference${s.images.length === 1 ? '' : 's'}` : 'Ready to collect'}</span></div><div class="card-title"><h3>${escape(s.name)}</h3><span>${image ? 'Collected' : 'To explore'}</span></div></button><div class="style-tags">${(s.tags || []).slice(0, 4).map(tag => `<button class="keyword" data-tag="${escape(tag)}">${escape(tag)}</button>`).join('')}</div><p class="card-keywords">${s.keywords.slice(0, 2).map(escape).join(' · ')}</p><a class="card-search" href="${links(s.keywords[0])['Google Images']}" target="_blank" rel="noopener noreferrer">Find inspiration <span aria-hidden="true">↗</span></a></article>`;
  }).join('');
  $('#empty-state').hidden = filtered.length > 0;
  $('#empty-copy').textContent = query ? 'Try a different style name or keyword.' : view === 'empty' ? 'Every style has a reference. Add an empty style to explore something new.' : 'Import an image to start your collection.';
}
function showStyle(id, slide = 0) {
  const style = styles.find(s => s.id === id); if (!style) return;
  selectedStyle = id;
  const tags = (style.tags || []).map(tag => `<button class="keyword" data-tag="${escape(tag)}">${escape(tag)}</button>`).join('');
  // The art stays clean: tags and the actions menu live with the style name, not over the image.
  $('#style-content').innerHTML = `<div class="style-media">${heroCarousel(style)}</div>
    <div class="style-info">
    <header class="style-identity">
      <div class="identity-row"><h2 id="style-title">${escape(style.name)}</h2>${actionMenu(style)}</div>
      ${tags ? `<div class="style-tags identity-tags" aria-label="Visual tags">${tags}</div>` : ''}
      ${heroThumbs(style)}
    </header>
    ${style.images.length ? referencePanel(style) : ''}
    <section class="detail-section" aria-labelledby="discover-title">
      <div class="section-head"><h3 id="discover-title">Find more like this</h3></div>
      <div class="keywords">${style.keywords.map(k => `<a class="keyword" href="${links(k)['Google Images']}" target="_blank" rel="noopener noreferrer">${escape(k)}</a>`).join('')}</div>
      <div class="search-links">${Object.entries(links(style.keywords[0])).map(([name, url]) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${name} ↗</a>`).join('')}</div>
      ${style.images.length ? '<p id="image-tags" class="image-tags"></p>' : ''}
    </section>
    </div>`;
  if (!$('#style-dialog').open) { $('#modal-veil').hidden = false; $('#style-dialog').showModal(); history.pushState({ artbook: 'style' }, ''); }
  $('#add-to-style').onclick = () => chooseFiles(id);
  $('#edit-style').onclick = () => showForm(style);
  if ($('#delete-style')) $('#delete-style').onclick = () => deleteStyle($('#delete-style'), id);
  if (emptiedStyle && emptiedStyle.id !== id && styles.some(s => s.id === emptiedStyle.id && !s.images.length)) showEmptiedNotice();
  setupCarousel(slide);
  setupMenu();
  $('#copy-keywords').onclick = async () => { try { await copyText(style.keywords.join(', ')); toast('Keywords copied.'); } catch { toast('Select the keywords and copy them manually.'); } };
}
// One menu holds every style and image action, grouped by what it acts on.
function actionMenu(style) {
  const hasImages = style.images.length > 0;
  return `<div class="menu-wrap">
      <button class="menu-button" id="actions-button" aria-haspopup="menu" aria-expanded="false" aria-controls="action-menu" aria-label="Style and image actions">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
      </button>
      <div class="action-menu" id="action-menu" role="menu" hidden>
        <div class="menu-view" id="menu-main">
        <p class="menu-label">Style</p>
        <button role="menuitem" id="add-to-style">Add images to this style</button>
        <button role="menuitem" id="edit-style">Edit style &amp; keywords</button>
        <button role="menuitem" id="copy-keywords">Copy all keywords</button>
        ${hasImages ? '' : '<button role="menuitem" class="danger-item" id="delete-style" data-keep-open>Delete style</button>'}
        ${hasImages ? `<p class="menu-label">This image</p>
        <button role="menuitem" id="reidentify-image" title="Uses Codex to find a specific style and tags. Different treatments get a separate collection.">Re-identify style</button>
        <button role="menuitem" id="open-move" data-keep-open>Move to another style…</button>
        <a role="menuitem" id="pin-source" target="_blank" rel="noopener noreferrer" hidden>Open original source ↗</a>
        <button role="menuitem" class="danger-item" id="delete-image" data-keep-open>Delete image</button>` : ''}
        </div>
        ${hasImages ? `<div class="menu-view" id="menu-move" hidden>
          <div class="menu-move-head"><button class="menu-back" id="move-back" aria-label="Back to actions"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg></button><span>Move to</span></div>
          <input type="search" id="move-search" placeholder="Search styles" aria-label="Search styles" autocomplete="off">
          <div class="move-list" id="move-list"></div>
          <p class="move-empty" id="move-empty" hidden>No style matches.</p>
        </div>` : ''}
      </div>
    </div>`;
}
const visibleItems = menu => [...menu.querySelectorAll('[role=menuitem]:not(:disabled), #move-search')].filter(el => el.offsetParent !== null);
function setMenu(open) {
  const menu = $('#action-menu'), button = $('#actions-button'); if (!menu) return;
  menu.hidden = !open; button.setAttribute('aria-expanded', open);
  if (open) { showMenuView('main'); visibleItems(menu)[0]?.focus({ preventScroll: true }); revealMenu(); }
}
// Focus no longer jumps the sheet; instead scroll smoothly just enough to bring the whole menu into view.
function revealMenu() {
  const menu = $('#action-menu'), dialog = $('#style-dialog');
  if (!menu || menu.hidden) return;
  requestAnimationFrame(() => {
    const box = menu.getBoundingClientRect(), view = dialog.getBoundingClientRect(), margin = 16;
    const below = box.bottom - (view.bottom - margin), above = (view.top + margin) - box.top;
    const delta = below > 0 ? below : above > 0 ? -above : 0;
    if (delta) dialog.scrollBy({ top: delta, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
}
function showMenuView(view) {
  if (!$('#menu-move')) return;
  $('#menu-main').hidden = view !== 'main';
  $('#menu-move').hidden = view !== 'move';
  if (view === 'move') { $('#move-search').value = ''; renderMoveList(''); $('#move-search').focus({ preventScroll: true }); }
  else $('#open-move')?.focus({ preventScroll: true });
  revealMenu();
}
// Styles the current image can move to, filtered by the search text.
function renderMoveList(query) {
  const q = query.trim().toLowerCase();
  const options = styles.filter(s => s.id !== selectedStyle && s.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  $('#move-list').innerHTML = options.map(s => `<button role="menuitem" class="move-option" data-move="${s.id}" data-keep-open><span>${escape(s.name)}</span><span class="move-count">${s.images.length}</span></button>`).join('');
  $('#move-empty').hidden = options.length > 0;
}
function setupMenu() {
  const menu = $('#action-menu'); if (!menu) return;
  $('#actions-button').onclick = event => { event.stopPropagation(); setMenu(menu.hidden); };
  // Picking an action closes the menu, except two-step deletes and the move controls.
  menu.addEventListener('click', event => { const item = event.target.closest('[role=menuitem]'); if (item && !item.hasAttribute('data-keep-open')) setMenu(false); });
  menu.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = visibleItems(menu), at = items.indexOf(document.activeElement);
    event.preventDefault(); items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  });
  if ($('#open-move')) {
    $('#open-move').onclick = () => showMenuView('move');
    $('#move-back').onclick = () => showMenuView('main');
    $('#move-search').oninput = event => renderMoveList(event.target.value);
    $('#move-search').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); $('#move-list .move-option')?.click(); } };
    $('#move-list').onclick = event => { const option = event.target.closest('[data-move]'); if (option) moveImageTo(option.dataset.move); };
  }
}
document.addEventListener('click', event => { if (!event.target.closest('.menu-wrap')) setMenu(false); });
$('#style-dialog').addEventListener('cancel', event => {
  if (!$('#action-menu') || $('#action-menu').hidden) return;
  event.preventDefault();
  if ($('#menu-move') && !$('#menu-move').hidden) return showMenuView('main');
  setMenu(false); $('#actions-button').focus();
});
function referencePanel(style) {
  const count = style.images.length;
  return `<section class="detail-section image-panel" aria-labelledby="image-section-title">
      <div class="section-head"><h3 id="image-section-title">This image</h3>${count > 1 ? `<span class="section-meta"><span id="panel-index">1</span> of ${count}</span>` : ''}</div>
      <p id="image-ai" class="ai-origin" hidden></p>
      <div class="image-info"><h4 id="image-name"></h4><p id="image-description"></p><a id="image-source" class="image-source" target="_blank" rel="noopener noreferrer" hidden></a></div>
      <div id="image-prompts" class="image-prompts">
        <div class="prompt-tabs"><div role="tablist" aria-label="Generation prompts">
          <button role="tab" id="tab-image-prompt" data-prompt-tab="image-prompt" aria-controls="panel-image-prompt">Similar image</button>
          <button role="tab" id="tab-style-prompt" data-prompt-tab="style-prompt" aria-controls="panel-style-prompt">Same style, new subject</button>
        </div><button class="text-button" id="copy-prompt">Copy</button></div>
        <div class="prompt-block" role="tabpanel" id="panel-image-prompt" aria-labelledby="tab-image-prompt"><p id="image-prompt"></p></div>
        <div class="prompt-block" role="tabpanel" id="panel-style-prompt" aria-labelledby="tab-style-prompt"><p id="style-prompt"></p><p class="field-hint">Replace the subject in [brackets] with your own.</p></div>
      </div>
      <p id="prompts-missing" class="field-hint">No prompts yet for this image. Re-identify it to create them.</p>
      <p id="reidentify-status" role="status"></p><p id="move-error" role="alert"></p>
    </section>`;
}
function heroThumbs(style) {
  const many = style.images.length > 1;
  return many ? `<div class="hero-thumbs">${style.images.map((i, n) => `<button class="hero-thumb${n ? '' : ' active'}" data-slide="${n}" aria-label="Show reference ${n + 1}"${n ? '' : ' aria-current="true"'}><img src="${imageURL(i)}" alt="" loading="lazy"></button>`).join('')}</div>` : '';
}
function heroCarousel(style) {
  const count = style.images.length;
  if (!count) return '<div class="detail-empty hero-empty">Your next inspiration starts here.<br>Explore the searches below, then bring back an image you love.</div>';
  const many = count > 1;
  return `<section class="hero" aria-roledescription="carousel" aria-label="${escape(style.name)} references">
    <div class="hero-frame">
    <div class="hero-stage">
      <div class="hero-track" tabindex="0" aria-live="polite">${style.images.map((i, n) => `<button class="hero-slide" data-zoom="${n}" aria-roledescription="slide" aria-haspopup="dialog" aria-label="Reference ${n + 1} of ${count}. Select to view larger"><img src="${imageURL(i)}" alt="${escape(i.originalName)}" ${n > 1 ? 'loading="lazy"' : ''}></button>`).join('')}</div>
      ${many ? '<button class="hero-nav hero-prev" data-step="-1" aria-label="Previous reference"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg></button><button class="hero-nav hero-next" data-step="1" aria-label="Next reference"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5"/></svg></button>' : ''}
      <span class="hero-status" aria-hidden="true"><span class="import-pulse"></span>Identifying style…</span>
    </div>
    </div>
  </section>`;
}
let heroTarget = null; // slide a button/key scroll is heading to, so quick repeated presses don't read a mid-animation position
function carouselIndex() {
  const track = $('.hero-track');
  return track ? Math.round(track.scrollLeft / track.clientWidth) : 0;
}
const currentSlide = () => heroTarget ?? carouselIndex();
function goToSlide(index) {
  const track = $('.hero-track'); if (!track) return;
  const count = track.children.length;
  const next = (index + count) % count;
  heroTarget = next;
  track.scrollTo({ left: next * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
let promptTab = 'image-prompt';
function showPromptTab(name) {
  const available = [...document.querySelectorAll('[data-prompt-tab]')].filter(tab => !tab.hidden).map(tab => tab.dataset.promptTab);
  if (!available.length) return;
  const active = available.includes(name) ? name : available[0];
  promptTab = name;
  document.querySelectorAll('[data-prompt-tab]').forEach(tab => { const on = tab.dataset.promptTab === active; tab.setAttribute('aria-selected', on); tab.tabIndex = on ? 0 : -1; });
  ['image-prompt', 'style-prompt'].forEach(id => { $(`#panel-${id}`).hidden = id !== active; });
}
function selectImage(index) {
  const style = styles.find(s => s.id === selectedStyle);
  const image = style?.images[index]; if (!image || image === selectedImage) return;
  selectedImage = image;
  const styleTags = new Set(style.tags || []);
  const own = (image.tags || []).filter(tag => !styleTags.has(tag));
  $('#image-tags').textContent = own.length ? `Also: ${own.join(' · ')}` : '';
  if ($('#panel-index')) $('#panel-index').textContent = index + 1;
  $('#image-name').textContent = image.title || '';
  $('#image-description').textContent = image.description || '';
  // AI origin shows only on positive evidence: confirmed (file metadata) or likely (visible generator watermark).
  const ai = image.aiOrigin;
  $('#image-ai').hidden = !ai;
  if (ai) {
    // Results saved before the wording change still read "Image metadata marks it as …" / "Image metadata names …".
    const evidence = ai.evidence.replace(/^Image metadata marks it as AI-(?:edited|generated)/, 'From image metadata').replace(/^Image metadata names (.+)$/, 'From image metadata ($1)');
    $('#image-ai').dataset.status = ai.status;
    $('#image-ai').innerHTML = `<strong>${ai.status === 'confirmed' ? 'AI-generated' : 'Likely AI-generated'}</strong><span>${escape(evidence)}</span>`;
  }
  $('#image-prompt').textContent = image.imagePrompt || '';
  // The [subject] placeholder takes the hint's muted color so it is easy to spot and replace; copying keeps the brackets.
  $('#style-prompt').innerHTML = escape(image.stylePrompt || '').replace(/\[[^\]]*\]/g, match => `<span class="prompt-slot">${match}</span>`);
  $('#image-prompts').hidden = !image.imagePrompt && !image.stylePrompt;
  $('#prompts-missing').hidden = !$('#image-prompts').hidden;
  document.querySelectorAll('[data-prompt-tab]').forEach(tab => { tab.hidden = !$(`#${tab.dataset.promptTab}`).textContent; });
  showPromptTab(promptTab);
  markAnalyzing();
  $('#reidentify-status').textContent = ''; $('#move-error').textContent = '';
  resetDelete();
  // Show where the reference came from whenever its source link is known.
  $('#image-source').hidden = !image.sourceUrl;
  if (image.sourceUrl) {
    let host = image.sourceUrl; try { host = new URL(image.sourceUrl).hostname.replace(/^www\./, ''); } catch {}
    $('#image-source').href = image.sourceUrl;
    $('#image-source').innerHTML = `<span>Source</span><span class="source-value">${escape(host)} ↗</span>`;
  }
  $('#pin-source').hidden = !image.sourceUrl;
  if (image.sourceUrl) $('#pin-source').href = image.sourceUrl;
}
let heroIndex = 0; // last settled slide, used to keep position when the window resizes
function openLightbox(index) {
  const image = styles.find(s => s.id === selectedStyle)?.images[index]; if (!image) return;
  const img = $('#lightbox-image');
  img.alt = image.originalName;
  img.onload = fitLightbox;
  img.src = imageURL(image);
  if (img.complete) fitLightbox();
  // The lightbox fills the screen with a deep shade of this image's own color (its tint from the carousel).
  const slideImg = document.querySelectorAll('.hero-slide img')[index];
  const tint = slideImg && edgeFills.get(slideImg.currentSrc || slideImg.src)?.tint;
  if (tint) $('#lightbox').style.setProperty('--tint', tint); else $('#lightbox').style.removeProperty('--tint');
  if (!$('#lightbox').open) $('#lightbox').showModal();
}
// Scale the image (up or down) to the largest size that fits the viewport, keeping its aspect ratio.
function fitLightbox() {
  const img = $('#lightbox-image'); if (!img.naturalWidth) return;
  const gap = innerWidth <= 700 ? 24 : 64;
  const scale = Math.min((innerWidth - gap) / img.naturalWidth, (innerHeight - gap) / img.naturalHeight);
  img.style.width = `${Math.round(img.naturalWidth * scale)}px`;
  img.style.height = `${Math.round(img.naturalHeight * scale)}px`;
}
addEventListener('resize', () => { if ($('#lightbox').open) fitLightbox(); });
// Fill the empty space beside each image with its own edge colors, so the slide reads as one continuous picture.
// Pillarboxed images use their left and right edge colors; letterboxed ones their top and bottom.
const edgeFills = new Map();
function edgeFill(img) {
  const key = img.currentSrc || img.src;
  if (!edgeFills.has(key)) {
    const size = 48, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(img, 0, 0, size, size);
    const { data } = context.getImageData(0, 0, size, size);
    const px = (x, y) => { const i = (y * size + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    // Median per channel, so a dark object touching the edge does not tint the whole fill.
    const median = (pick) => {
      const channels = [[], [], []];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (pick(x, y)) px(x, y).forEach((v, k) => channels[k].push(v));
      return channels.map(c => c.sort((a, z) => a - z)[c.length >> 1]);
    };
    // Background color: the most common (quantized) color around the whole border. When it clearly dominates,
    // edge bands that differ from it are the subject touching the edge, and get the background color instead.
    const buckets = new Map(); let perimeter = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (x && y && x < size - 1 && y < size - 1) continue;
      const c = px(x, y), q = (c[0] >> 5) << 6 | (c[1] >> 5) << 3 | (c[2] >> 5);
      const entry = buckets.get(q) || { n: 0, sum: [0, 0, 0] };
      entry.n++; c.forEach((v, k) => entry.sum[k] += v); buckets.set(q, entry); perimeter++;
    }
    const top = [...buckets.values()].sort((a, z) => z.n - a.n)[0];
    const background = top.sum.map(v => Math.round(v / top.n));
    const clearBackground = top.n / perimeter >= 0.4;
    const far = (c) => Math.hypot(c[0] - background[0], c[1] - background[1], c[2] - background[2]) > 70;
    const css = (c) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
    // Sample each edge in bands, so the fill follows color changes along the edge instead of one flat average.
    const strip = 1, bands = 8, band = size / bands;
    const along = (edge) => Array.from({ length: bands }, (_, k) => {
      const c = median((x, y) => Math.floor((edge === 'left' || edge === 'right' ? y : x) / band) === k
        && (edge === 'left' ? x < strip : edge === 'right' ? x >= size - strip : edge === 'top' ? y < strip : y >= size - strip));
      return css(clearBackground && far(c) ? background : c);
    });
    // Tint: saturation-weighted mean of the whole image, so colorful areas lead over grey or white space.
    let r = 0, g = 0, b = 0, weight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const max = Math.max(data[i], data[i + 1], data[i + 2]), min = Math.min(data[i], data[i + 1], data[i + 2]);
      const w = 0.15 + (max ? (max - min) / max : 0);
      r += data[i] * w; g += data[i + 1] * w; b += data[i + 2] * w; weight += w;
    }
    const tint = `rgb(${Math.round(r / weight)} ${Math.round(g / weight)} ${Math.round(b / weight)})`;
    edgeFills.set(key, { left: along('left'), right: along('right'), top: along('top'), bottom: along('bottom'), tint });
  }
  const slide = img.closest('.hero-slide');
  const fill = edgeFills.get(key);
  const pillarbox = img.naturalWidth / img.naturalHeight < slide.clientWidth / slide.clientHeight;
  // Near-matching shapes: fill the frame (cropping at most 14% on the other axis) instead of leaving thin bands.
  const ratio = (img.naturalWidth / img.naturalHeight) / (slide.clientWidth / slide.clientHeight);
  slide.classList.toggle('bleed', 1 - (pillarbox ? ratio : 1 / ratio) < 0.14);
  const ramp = (colors, direction) => `linear-gradient(${direction}, ${colors.map((c, k) => `${c} ${Math.round((k + .5) / colors.length * 100)}%`).join(', ')})`;
  // Two half-size layers: left/right halves for pillarboxed images, top/bottom halves for letterboxed ones.
  slide.style.background = pillarbox
    ? `${ramp(fill.left, '180deg')} left / 50% 100% no-repeat, ${ramp(fill.right, '180deg')} right / 50% 100% no-repeat`
    : `${ramp(fill.top, '90deg')} top / 100% 50% no-repeat, ${ramp(fill.bottom, '90deg')} bottom / 100% 50% no-repeat`;
}
// Washes the whole style modal with a light version of the current image's color.
function applyTint() {
  const img = document.querySelectorAll('.hero-slide img')[heroIndex];
  const tint = img && edgeFills.get(img.currentSrc || img.src)?.tint;
  if (tint) $('#style-dialog').style.setProperty('--tint', tint);
  else $('#style-dialog').style.removeProperty('--tint');
  // ::backdrop does not inherit the tint in every browser, so a separate layer behind the modal carries it.
  if (tint) $('#modal-veil').style.setProperty('--tint', tint); else $('#modal-veil').style.removeProperty('--tint');
}
function paintSlides() {
  applyTint();
  document.querySelectorAll('.hero-slide img').forEach(img => {
    const paint = () => { try { edgeFill(img); applyTint(); } catch {} };
    if (img.complete && img.naturalWidth) paint(); else img.addEventListener('load', paint, { once: true });
  });
}
function setupCarousel(slide = 0) {
  selectedImage = null;
  const track = $('.hero-track'); if (!track) { $('#style-dialog').style.removeProperty('--tint'); return; }
  const start = Math.min(slide, track.children.length - 1);
  track.scrollLeft = start * track.clientWidth;
  heroTarget = null;
  selectImage(start);
  if (start) { document.querySelectorAll('.hero-thumb').forEach((t, n) => { t.classList.toggle('active', n === start); t.toggleAttribute('aria-current', n === start); }); }
  heroIndex = start;
  document.querySelectorAll('[data-zoom]').forEach(button => button.onclick = () => openLightbox(Number(button.dataset.zoom)));
  // React to width changes only: height changes (e.g. a phone's address bar) must not re-snap or repaint the slides.
  let trackWidth = track.clientWidth;
  new ResizeObserver(() => {
    if (track.clientWidth === trackWidth) return;
    trackWidth = track.clientWidth;
    track.scrollLeft = (heroTarget ?? heroIndex) * track.clientWidth; paintSlides();
  }).observe(track);
  paintSlides();
  markAnalyzing();
  if ($('#delete-image')) $('#delete-image').onclick = deleteImage;
  document.querySelectorAll('[data-prompt-tab]').forEach(tab => tab.onclick = () => showPromptTab(tab.dataset.promptTab));
  $('[role=tablist]')?.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault(); event.stopPropagation();
    const tabs = [...document.querySelectorAll('[data-prompt-tab]:not([hidden])')];
    const next = tabs[(tabs.indexOf(document.activeElement) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    if (next) { showPromptTab(next.dataset.promptTab); next.focus(); }
  });
  $('#copy-prompt').onclick = async () => {
    const panel = document.querySelector('.prompt-block:not([hidden]) p');
    try { await copyText(panel.textContent); toast('Prompt copied.'); }
    catch { toast('Select the prompt and copy it manually.'); }
  };
  $('#reidentify-image').onclick = reidentifyImage;
  let frame;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const index = carouselIndex();
      if (index === heroTarget && track.scrollLeft % track.clientWidth < 2) heroTarget = null;
      heroIndex = index;
      selectImage(index);
      applyTint();
      document.querySelectorAll('.hero-thumb').forEach((thumb, n) => {
        thumb.classList.toggle('active', n === index);
        if (n === index) { thumb.setAttribute('aria-current', 'true'); revealThumb(thumb); }
        else thumb.removeAttribute('aria-current');
      });
    });
  }, { passive: true });
  track.addEventListener('scrollend', () => { heroTarget = null; });
  document.querySelectorAll('[data-step]').forEach(button => button.onclick = () => goToSlide(currentSlide() + Number(button.dataset.step)));
  document.querySelectorAll('[data-slide]').forEach(button => button.onclick = () => goToSlide(Number(button.dataset.slide)));
}
document.addEventListener('keydown', event => {
  if (!$('#style-dialog').open || $('#edit-dialog').open || !$('.hero-nav')) return;
  if (event.target.closest?.('input, textarea, select, [role=tablist]')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const count = $('.hero-track').children.length;
    const next = (currentSlide() + (event.key === 'ArrowRight' ? 1 : -1) + count) % count;
    goToSlide(next);
    if ($('#lightbox').open) openLightbox(next);
  }
});
$('#lightbox').addEventListener('click', () => $('#lightbox').close());
function showForm(style) {
  editingId = style?.id || null;
  $('#style-form').reset(); $('#form-error').textContent = '';
  $('#form-title').textContent = style ? 'Edit style' : 'Add an empty style';
  $('#style-form [name=name]').value = style?.name || '';
  $('#style-form [name=keywords]').value = style?.keywords.join(', ') || '';
  $('#style-form [name=tags]').value = style?.tags?.join(', ') || '';
  $('#edit-dialog').showModal();
}
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('#toast').hidden = true; }, 4000); }
function chooseFiles(target = null) { importTarget = target; $('#file-input').click(); }
function importRow(item, state) {
  if (state.status === 'done') {
    const { style, image } = state.result;
    item.innerHTML = `<img src="${imageURL(image)}" alt="Imported reference"><div><strong>${escape(style.name)}</strong><p>${style.keywords.slice(0, 3).map(escape).join(' · ')}</p></div><button class="text-button" data-style="${style.id}">View style</button>`;
  } else if (state.status === 'error' || state.status === 'missing') {
    const message = state.status === 'missing' ? 'Import was interrupted (upload cut off or Artbook restarted). Choose the image again.' : state.error;
    item.innerHTML = state.duplicate
      ? `<img src="${imageURL(state.duplicate)}" alt="Duplicate reference"><div><strong>${escape(state.name)}</strong><p class="error">${escape(message)} Not imported.</p></div>${state.duplicate.styleId ? `<button class="text-button" data-style="${escape(state.duplicate.styleId)}">View style</button>` : ''}`
      : `<div><strong>${escape(state.name)}</strong><p class="error">${escape(message)}</p></div>`;
  } else {
    item.innerHTML = `${state.preview ? `<img src="${state.preview}" alt="Selected reference">` : ''}<div><strong><span class="import-pulse"></span>${state.status === 'uploading' ? 'Uploading…' : state.status === 'queued' ? 'Waiting in line…' : state.styleId ? 'Adding to your style…' : 'Finding the visual style…'}</strong><p>${escape(state.name)}</p></div>`;
  }
  item.dataset.status = state.status;
}
function importSummary() {
  const rows = [...$('#import-items').children];
  const done = rows.filter(r => r.dataset.status === 'done').length;
  const duplicates = rows.filter(r => r.querySelector('img[alt="Duplicate reference"]')).length;
  const pending = rows.filter(r => ['uploading', 'queued', 'running'].includes(r.dataset.status)).length;
  const failed = rows.length - done - duplicates - pending;
  $('#import-title').textContent = pending
    ? `Identifying ${rows.length} image${rows.length === 1 ? '' : 's'} · ${rows.length - pending} finished`
    : `${done} of ${rows.length} image${rows.length === 1 ? '' : 's'} saved${duplicates ? ` · ${duplicates} already in your library` : ''}${failed ? ' · Choose failed images again to retry' : ''}`;
  $('#dismiss-import').hidden = !!pending;
  return pending;
}
// ---- Client side of the job queue ----
// Every identification is a server job processed one at a time. The page tracks job ids in sessionStorage and a
// single poller keeps rows, busy states and results in sync, so jobs can be queued freely and survive reloads.
const liveRecords = new Map();   // jobs started by this page load, with extras (preview URL, live flag)
const jobRows = new Map();       // import job id -> row element
const appliedJobs = new Set();   // jobs whose final result was already applied
const reidentifying = new Map(); // imageId -> 'queued' | 'running'
let polling = false;
function showImportPanel() {
  const rows = [...$('#import-items').children];
  if (!rows.some(r => ['uploading', 'queued', 'running'].includes(r.dataset.status))) { $('#import-items').replaceChildren(); jobRows.clear(); }
  $('#import-panel').hidden = false;
}
function addImportRow(record, state) {
  const item = document.createElement('div'); item.className = 'import-item'; item.dataset.job = record.id;
  $('#import-items').append(item); jobRows.set(record.id, item);
  importRow(item, { ...record, ...state }); importSummary();
}
async function applyJob(record, state) {
  if (appliedJobs.has(record.id)) return;
  const finished = ['done', 'error', 'missing'].includes(state.status);
  if (state.status === 'missing' && record.live) return; // still uploading: the server has not registered it yet
  if (record.kind === 'import') {
    const row = jobRows.get(record.id);
    if (row) importRow(row, { ...record, ...state, name: state.name || record.name, preview: record.preview || (state.filename ? imageURL(state) : null) });
  } else if (!finished) { reidentifying.set(record.imageId, state.status === 'running' ? 'running' : 'queued'); markAnalyzing(); }
  if (!finished) { if (record.kind === 'import') importSummary(); return; }
  appliedJobs.add(record.id); untrackJob(record.id); liveRecords.delete(record.id);
  if (record.kind === 'import') {
    if (record.preview) URL.revokeObjectURL(record.preview);
    if (state.status === 'done') await refresh();
    importSummary(); record.onDone?.(state);
    return;
  }
  reidentifying.delete(record.imageId);
  await refresh(); markAnalyzing();
  if (state.status === 'done') finishReidentify(state.result, record);
  else toast(state.status === 'missing' ? 'Re-identify was interrupted because Artbook restarted.' : state.error);
}
// Sends a job request; the response settles it directly, the poller reports queue position meanwhile.
function sendJob(live, path, options) {
  liveRecords.set(live.id, live);
  trackJob({ id: live.id, kind: live.kind, name: live.name, styleId: live.styleId, imageId: live.imageId, sourceStyleId: live.sourceStyleId });
  api(path, { ...options, headers: { ...options.headers, 'X-Job-Id': live.id } }).then(
    result => applyJob(live, { status: 'done', result }),
    error => {
      if (error.network) { live.live = false; return; }
      // A pasted image whose web original could not be fetched falls back to the pasted pixels.
      if (live.fallback && !error.duplicate) {
        appliedJobs.add(live.id); untrackJob(live.id); liveRecords.delete(live.id);
        jobRows.get(live.id)?.remove(); jobRows.delete(live.id);
        return importFiles([live.fallback]);
      }
      applyJob(live, { status: 'error', error: error.message, duplicate: error.duplicate });
    });
  pollJobs();
}
async function pollJobs() {
  if (polling) return; polling = true;
  try {
    while (trackedJobs().length) {
      await new Promise(r => setTimeout(r, 1200));
      const list = trackedJobs(); if (!list.length) break;
      try {
        const states = await api(`/api/jobs?ids=${list.map(j => encodeURIComponent(j.id)).join(',')}`);
        for (const state of states) { const record = liveRecords.get(state.id) || list.find(j => j.id === state.id); if (record) await applyJob(record, state); }
      } catch {}
    }
  } finally { polling = false; }
}
function importFiles(files, target = null) {
  if (!files.length) return;
  $('#style-dialog').close(); showImportPanel();
  for (const file of files) {
    const live = { id: newJobId(), kind: 'import', name: file.name, styleId: target, live: true, preview: URL.createObjectURL(file) };
    addImportRow(live, { status: 'uploading' });
    if (file.size > 15 * 1024 * 1024) { applyJob(live, { status: 'error', error: 'Image exceeds 15 MB. Choose a smaller file.' }); continue; }
    sendJob(live, `/api/import${target ? `?styleId=${encodeURIComponent(target)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
  }
}
async function checkConnection() {
  $('#connection-label').textContent = 'Checking Codex…';
  try {
    const result = await api('/api/status');
    $('#connection-label').textContent = result.connected ? 'Codex connected' : 'Codex needs attention';
    $('#connection-dot').classList.toggle('connected', result.connected);
    $('#connection-detail').textContent = result.connected ? 'Uses your subscription. Saved on this computer.' : result.message;
    if (!result.connected) toast(result.message);
  } catch (error) { $('#connection-label').textContent = 'Connection unavailable'; $('#connection-detail').textContent = error.message; }
}
document.addEventListener('click', event => {
  const tag = event.target.closest('[data-tag]');
  if (tag) { $('#search').value = tag.dataset.tag; $('#style-dialog').close(); render(); }
  const style = event.target.closest('[data-style]'); if (style) showStyle(style.dataset.style);
});
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => {
  view = button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b === button)); render();
});
$('#search').addEventListener('input', render);
$('#upload-top').onclick = () => chooseFiles();
$('#file-input').onchange = event => { importFiles(Array.from(event.target.files), importTarget); event.target.value = ''; };
// Drop anywhere: a page-wide layer appears while files are dragged over the window.
let dragDepth = 0;
const draggingFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
addEventListener('dragenter', event => { if (!draggingFiles(event)) return; event.preventDefault(); dragDepth++; $('#drop-layer').hidden = false; });
addEventListener('dragleave', event => { if (!draggingFiles(event)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop-layer').hidden = true; });
addEventListener('dragover', event => { if (draggingFiles(event)) event.preventDefault(); });
addEventListener('drop', event => {
  event.preventDefault(); dragDepth = 0; $('#drop-layer').hidden = true;
  if (!draggingFiles(event) || $('#edit-dialog').open) return;
  const files = [...event.dataTransfer.files].filter(file => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type));
  if (!files.length) return toast('Drop a PNG, JPEG or WebP image.');
  importFiles(files);
});
document.addEventListener('paste', event => {
  const images = Array.from(event.clipboardData?.items || [])
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile()).filter(Boolean);
  if (!images.length) {
    const text = event.clipboardData?.getData('text/plain')?.trim() || '';
    if (!/^https?:\/\/\S+$/i.test(text) || event.target.closest?.('input, textarea, [contenteditable]') || $('#edit-dialog').open) return;
    event.preventDefault();
    return importLink(text);
  }
  event.preventDefault();
  if ($('#edit-dialog').open) return toast('Close the editor, then paste again to import.');
  const supported = images.filter(file => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type));
  if (!supported.length) return toast('Paste a PNG, JPEG or WebP image.');
  if (supported.length < images.length) toast('Only PNG, JPEG and WebP images will be imported.');
  // Copying an image on a web page usually also puts its address on the clipboard. Importing from that address
  // keeps the original file (with any AI metadata) and its source link; the pasted pixels are the fallback.
  const source = pastedImageAddress(event.clipboardData);
  if (source && supported.length === 1) return importPastedOriginal(source, supported[0]);
  importFiles(supported);
});
function pastedImageAddress(clipboard) {
  const html = clipboard?.getData('text/html');
  const src = html ? new DOMParser().parseFromString(html, 'text/html').querySelector('img[src]')?.getAttribute('src') : null;
  const candidate = src || clipboard?.getData('text/uri-list')?.split(/\r?\n/).find(line => line && !line.startsWith('#'))?.trim();
  return /^https?:\/\//i.test(candidate || '') ? candidate : null;
}
function importPastedOriginal(url, file) {
  $('#style-dialog').close(); showImportPanel();
  let host = url; try { host = new URL(url).hostname; } catch {}
  const live = { id: newJobId(), kind: 'import', name: `${file.name || 'Pasted image'} · from ${host}`.slice(0, 180), styleId: null, live: true, fallback: file };
  addImportRow(live, { status: 'uploading' });
  sendJob(live, '/api/import-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
}
$('#new-style').onclick = () => showForm();
$('#close-style').onclick = () => $('#style-dialog').close();
$('#close-edit').onclick = () => $('#edit-dialog').close();
$('#dismiss-import').onclick = () => { $('#import-panel').hidden = true; };
$('#recheck').onclick = checkConnection;
// Pasting an image URL or a Pinterest pin link anywhere on the page imports it.
function importLink(url) {
  $('#style-dialog').close(); showImportPanel();
  const live = { id: newJobId(), kind: 'import', name: url.slice(0, 180), styleId: null, live: true };
  addImportRow(live, { status: 'uploading' });
  sendJob(live, '/api/import-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
}
$('#style-form').onsubmit = async event => {
  event.preventDefault(); const button = $('#style-form button[type=submit]'); button.disabled = true;
  try {
    const input = { name: $('#style-form [name=name]').value, keywords: $('#style-form [name=keywords]').value.split(',').map(s => s.trim()).filter(Boolean), tags: $('#style-form [name=tags]').value.split(',').map(s => s.trim()).filter(Boolean) };
    const result = await api(editingId ? `/api/styles/${editingId}` : '/api/styles', { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    await refresh(); $('#edit-dialog').close(); showStyle(result.id); toast('Style saved.');
  } catch (error) { $('#form-error').textContent = error.message; }
  finally { button.disabled = false; }
};
// Two-step delete: first press arms the button, second press within 4 seconds deletes.
// Empty style left behind by a re-identify that moved its image, offered for deletion in the next view.
let emptiedStyle = null;
function showEmptiedNotice() {
  ($('.style-info') || $('#style-content')).insertAdjacentHTML('afterbegin', `<div class="notice" role="status" id="emptied-notice"><p>“${escape(emptiedStyle.name)}” is now empty. Delete it?</p><div><button class="secondary danger-solid" id="delete-emptied">Delete empty style</button><button class="text-button" id="keep-emptied">Keep it</button></div></div>`);
  $('#keep-emptied').onclick = () => { emptiedStyle = null; $('#emptied-notice').remove(); };
  $('#delete-emptied').onclick = async () => {
    const button = $('#delete-emptied'); button.disabled = true;
    try {
      const result = await api(`/api/styles/${encodeURIComponent(emptiedStyle.id)}`, { method: 'DELETE' });
      emptiedStyle = null; $('#emptied-notice').remove();
      await refresh(); toast(`Deleted “${result.name}”.`);
    } catch (error) { button.disabled = false; toast(error.message); }
  };
}
$('#style-dialog').addEventListener('close', () => {
  emptiedStyle = null;
  $('#modal-veil').hidden = true;
  // Closed by the button, Esc or backdrop: drop the history entry pushed on open.
  if (!closingFromHistory && history.state?.artbook === 'style') history.back();
  closingFromHistory = false;
});
// The browser/phone back gesture closes the style modal instead of leaving Artbook (phones have no close button).
let closingFromHistory = false;
addEventListener('popstate', () => {
  if (!$('#style-dialog').open) return;
  closingFromHistory = true;
  if ($('#lightbox').open) $('#lightbox').close();
  $('#style-dialog').close();
});
// Two-step delete for an empty style: first press arms, second press within 4 seconds deletes.
async function deleteStyle(button, id) {
  if (!button.classList.contains('armed')) {
    button.classList.add('armed'); button.textContent = 'Click again to delete this style';
    clearTimeout(deleteStyle.timer);
    deleteStyle.timer = setTimeout(() => { button.classList.remove('armed'); button.textContent = 'Delete style'; }, 4000);
    return;
  }
  clearTimeout(deleteStyle.timer); button.disabled = true;
  try {
    const result = await api(`/api/styles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    $('#style-dialog').close(); await refresh(); toast(`Deleted “${result.name}”.`);
  } catch (error) { button.disabled = false; toast(error.message); }
}
function resetDelete() {
  const button = $('#delete-image'); if (!button) return;
  clearTimeout(resetDelete.timer);
  button.classList.remove('armed'); button.textContent = 'Delete image';
}
async function deleteImage() {
  const button = $('#delete-image');
  if (reidentifying.has(selectedImage.id)) return toast('This image is being identified. Delete it when that finishes.');
  if (!button.classList.contains('armed')) {
    button.classList.add('armed'); button.textContent = 'Click again to delete permanently';
    resetDelete.timer = setTimeout(resetDelete, 4000);
    return;
  }
  clearTimeout(resetDelete.timer);
  button.disabled = true;
  const slide = currentSlide();
  try {
    await api(`/api/images/${encodeURIComponent(selectedImage.id)}`, { method: 'DELETE' });
    await refresh(); showStyle(selectedStyle, Math.max(0, slide - (slide ? 1 : 0)));
    toast('Image deleted.');
  } catch (error) { $('#move-error').textContent = error.message; button.disabled = false; resetDelete(); }
}
async function moveImageTo(styleId) {
  if (!selectedImage || styleId === selectedStyle) return;
  const slide = currentSlide();
  $('#move-list').querySelectorAll('button').forEach(b => { b.disabled = true; });
  try {
    const result = await api('/api/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId: selectedImage.id, styleId }) });
    setMenu(false);
    await refresh(); showStyle(selectedStyle, slide); toast(`Image moved to “${result.name}”.`);
  } catch (error) { toast(error.message); $('#move-list').querySelectorAll('button').forEach(b => { b.disabled = false; }); }
}
// After a reload, pick up jobs this tab started; the poller then shows their progress and results.
function resumeJobs() {
  const tracked = trackedJobs(); if (!tracked.length) return;
  const imports = tracked.filter(j => j.kind === 'import');
  if (imports.length) { showImportPanel(); imports.forEach(record => addImportRow(record, { status: 'queued' })); }
  tracked.filter(j => j.kind === 'reclassify').forEach(record => reidentifying.set(record.imageId, 'queued'));
  markAnalyzing();
  pollJobs();
}
refresh().then(resumeJobs).catch(error => { $('#load-error').hidden = false; $('#load-error').textContent = `Could not load your library: ${error.message}. Refresh to retry.`; });
checkConnection();

function markAnalyzing() {
  const style = styles.find(s => s.id === selectedStyle);
  const state = selectedImage && style?.images.some(i => i.id === selectedImage.id) ? reidentifying.get(selectedImage.id) : null;
  $('.hero')?.classList.toggle('analyzing', !!state);
  $('.hero')?.classList.toggle('queued', state === 'queued');
  $('.hero-stage')?.setAttribute('aria-busy', !!state);
  if ($('.hero-status')) $('.hero-status').lastChild.textContent = state === 'queued' ? 'Waiting in line…' : 'Identifying style…';
  document.querySelectorAll('.hero-thumb').forEach((thumb, n) => thumb.classList.toggle('busy', reidentifying.has(style?.images[n]?.id)));
  const button = $('#reidentify-image');
  if (button) { button.disabled = !!state; button.textContent = state === 'queued' ? 'Queued' : state ? 'Identifying…' : 'Re-identify style'; }
  if ($('#reidentify-status')) $('#reidentify-status').textContent = '';
}
function finishReidentify(result, record) {
  const followModal = $('#style-dialog').open && [record.sourceStyleId, result.id].includes(selectedStyle);
  const slide = followModal ? currentSlide() : 0;
  const moved = result.id !== record.sourceStyleId;
  const source = styles.find(s => s.id === record.sourceStyleId);
  emptiedStyle = moved && source && !source.images.length ? { id: source.id, name: source.name } : null;
  if (followModal) showStyle(result.id, moved ? Math.max(0, result.images.findIndex(i => i.id === record.imageId)) : slide);
  toast(moved ? `Moved to “${result.name}”.` : 'Style details updated.');
}
// Scroll only the thumbnail strip sideways; scrollIntoView would also scroll the modal vertically and make it jump.
function revealThumb(thumb) {
  const strip = thumb.parentElement;
  if (!strip || strip.scrollWidth <= strip.clientWidth) return;
  const left = thumb.offsetLeft, right = left + thumb.offsetWidth;
  if (left >= strip.scrollLeft && right <= strip.scrollLeft + strip.clientWidth) return;
  strip.scrollTo({ left: left - (strip.clientWidth - thumb.offsetWidth) / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function reidentifyImage() {
  const imageId = selectedImage.id;
  if (reidentifying.has(imageId)) return;
  reidentifying.set(imageId, 'queued'); markAnalyzing();
  sendJob({ id: newJobId(), kind: 'reclassify', imageId, sourceStyleId: selectedStyle, live: true }, '/api/reclassify',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId }) });
}

// Close a modal when the backdrop (outside the panel) is clicked. Both press and release must land outside,
// so selecting text inside and releasing outside does not close it.
document.querySelectorAll('dialog').forEach(dialog => {
  let downOutside = false;
  const outside = event => {
    if (event.target !== dialog) return false;
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };
  dialog.addEventListener('pointerdown', event => { downOutside = outside(event); });
  dialog.addEventListener('click', event => { if (downOutside && outside(event)) dialog.close(); downOutside = false; });
});
