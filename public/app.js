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
  // Each tile knows its image's position, so clicking it opens the modal on that image.
  return `<div class="mosaic mosaic-${shown.length}">${shown.map((image, n) => `<span class="mosaic-tile" data-cover-slide="${style.images.indexOf(image)}"><img src="${imageURL(image)}" alt="${n ? '' : `${escape(style.name)} reference`}" loading="lazy">${extra && n === shown.length - 1 ? `<span class="mosaic-more">+${extra}</span>` : ''}</span>`).join('')}</div>`;
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
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed. Please try again.'), { duplicate: data.duplicate, httpStatus: response.status });
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
      <div id="image-palette" class="image-palette" role="list" aria-label="Color palette" hidden></div>
      <div id="image-prompts" class="image-prompts">
        <div class="prompt-tabs"><div role="tablist" aria-label="Generation prompts">
          <button role="tab" id="tab-image-prompt" data-prompt-tab="image-prompt" aria-controls="panel-image-prompt">Similar image</button>
          <button role="tab" id="tab-style-prompt" data-prompt-tab="style-prompt" aria-controls="panel-style-prompt">Same style, new subject</button>
        </div><button class="text-button" id="copy-prompt">Copy</button></div>
        <div class="prompt-block" role="tabpanel" id="panel-image-prompt" aria-labelledby="tab-image-prompt"><p id="image-prompt"></p><p class="prompt-colors" hidden></p></div>
        <div class="prompt-block" role="tabpanel" id="panel-style-prompt" aria-labelledby="tab-style-prompt"><p id="style-prompt"></p><p class="prompt-colors" hidden></p></div>
        <div class="generate-row" id="generate-row">
          <div class="generate-bar">
            <label class="test-field" id="subject-field"><span class="test-label">Subject</span><input type="text" id="test-subject" autocomplete="off" spellcheck="false" maxlength="200" placeholder="Your subject"></label>
            <div class="test-field"><span class="test-label" id="test-mode-label">Test as</span>
              <div class="segmented" id="test-mode" role="radiogroup" aria-labelledby="test-mode-label">
                <label><input type="radio" name="test-mode" value="image" checked><span>Image</span></label>
                <label><input type="radio" name="test-mode" value="claude"><span>SVG · Claude</span></label>
                <label><input type="radio" name="test-mode" value="codex"><span>SVG · Codex</span></label>
              </div></div>
            <button class="primary test-button" id="generate-style" title="Uses the prompt only, not this image. Takes a few minutes and uses your Codex allowance."><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 3.5h5M10.5 3.5v5.2L5.6 17.4A2 2 0 0 0 7.3 20.5h9.4a2 2 0 0 0 1.7-3.1l-4.9-8.7V3.5M7.8 14h8.4"/></svg><span id="generate-label">Test this prompt</span></button></div>
          <div class="generate-progress" id="generate-progress" hidden><span id="generate-status" role="status"></span><span class="step-dots" id="step-dots" aria-hidden="true">${'<i></i>'.repeat(5)}</span><span class="generate-thought" id="generate-thought" hidden></span></div>
          <div class="tests" id="tests" hidden><p class="tests-label">Tests</p><div id="generations" class="generations" role="group" aria-label="Test generations"></div></div>
        </div>
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
      <div class="hero-live" id="hero-live" hidden><img id="hero-live-art" alt="The drawing so far"><div class="hero-live-bar"><span class="hero-live-label" id="hero-live-label" role="status"></span><button class="hero-live-toggle" id="hero-live-toggle">Show original</button></div></div>
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
  $('#generate-row').hidden = active !== 'style-prompt';
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
  // The subject field starts with the prompt's example subject; editing it rewrites the [slot], so Copy and Test use it.
  const subject = (image.stylePrompt || '').match(/\[([^\]]*)\]/)?.[1] || '';
  if ($('#test-subject')) { $('#test-subject').value = subject; $('#test-subject').dataset.original = subject; $('#subject-field').hidden = !subject; }
  if ($('#test-mode')) { let saved = null; try { saved = localStorage.getItem('artbook-test-mode'); } catch {} const choice = $(`input[name="test-mode"][value="${['image', 'claude', 'codex'].includes(saved) ? saved : 'image'}"]`); if (choice) choice.checked = true; }
  $('#image-prompts').hidden = !image.imagePrompt && !image.stylePrompt;
  $('#prompts-missing').hidden = !$('#image-prompts').hidden;
  document.querySelectorAll('[data-prompt-tab]').forEach(tab => { tab.hidden = !$(`#${tab.dataset.promptTab}`).textContent; });
  showPromptTab(promptTab);
  showPalette();
  markAnalyzing();
  renderGenerations();
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
  delete $('#lightbox').dataset.generated;
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
    edgeFills.set(key, { left: along('left'), right: along('right'), top: along('top'), bottom: along('bottom'), tint, palette: paletteOf(data) });
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
// Palette: up to ten clearly different colors, most prominent first. Pixels are grouped into small color cubes;
// cubes are ranked by coverage with a boost for saturation, so a small vivid accent is not lost to large neutral
// areas; then each cube joins the first chosen color it is close to (redmean distance) or becomes a new one.
function paletteOf(data) {
  const cubes = new Map(); let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const q = (data[i] >> 4) << 8 | (data[i + 1] >> 4) << 4 | (data[i + 2] >> 4);
    const cube = cubes.get(q) || { n: 0, sum: [0, 0, 0] };
    cube.n++; for (let k = 0; k < 3; k++) cube.sum[k] += data[i + k];
    cubes.set(q, cube); total++;
  }
  const distance = (a, b) => {
    const r = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db);
  };
  const ranked = [...cubes.values()].map(cube => {
    const color = cube.sum.map(v => v / cube.n), max = Math.max(...color), min = Math.min(...color);
    return { ...cube, color, score: cube.n * (0.5 + (max ? (max - min) / max : 0)) };
  }).sort((a, z) => z.score - a.score);
  const chosen = [];
  for (const cube of ranked) {
    const near = chosen.find(c => distance(c.color, cube.color) < 60);
    if (near) { near.n += cube.n; for (let k = 0; k < 3; k++) near.sum[k] += cube.sum[k]; }
    else if (chosen.length < 10) chosen.push({ n: cube.n, sum: [...cube.sum], color: cube.color });
  }
  const hex = sum => n => '#' + sum.map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('').toUpperCase();
  return chosen.filter(c => c.n / total >= 0.01).sort((a, z) => z.n - a.n).map(c => ({ hex: hex(c.sum)(c.n), share: c.n / total }));
}
// Shows the palette of the selected image as small blocks; each copies its hex code,
// once its slide has loaded and been sampled.
function showPalette() {
  const box = $('#image-palette'); if (!box) return;
  const style = styles.find(s => s.id === selectedStyle);
  const img = document.querySelectorAll('.hero-slide img')[style?.images.indexOf(selectedImage) ?? -1];
  const palette = img && edgeFills.get(img.currentSrc || img.src)?.palette;
  box.hidden = !palette?.length;
  // Both prompts end with the exact palette, so a copied prompt carries the image's colors. Colors are grouped by
  // coverage in words (image generators follow "dominant/accent" better than percentages); the most prominent
  // color always counts as dominant.
  const bands = [['dominant', c => c.share >= 0.2], ['secondary', c => c.share >= 0.05], ['accents', () => true]];
  const grouped = new Map(bands.map(([name]) => [name, []]));
  (palette || []).forEach((c, n) => grouped.get(n === 0 ? 'dominant' : bands.find(([, fits]) => fits(c))[0]).push(c.hex));
  const description = [...grouped].filter(([, hexes]) => hexes.length).map(([name, hexes]) => `${name} ${hexes.join(', ')}`).join('; ');
  document.querySelectorAll('.prompt-colors').forEach(line => {
    line.hidden = box.hidden;
    line.textContent = box.hidden ? '' : `Color palette: ${description}.`;
    if (!box.hidden) colorCodes(line);
  });
  if (box.hidden) return;
  if (box.dataset.colors === palette.map(c => c.hex).join()) return;
  box.dataset.colors = palette.map(c => c.hex).join();
  // Built with DOM calls: the page's CSP blocks inline style attributes, but not styles set from script.
  box.replaceChildren(...palette.map(({ hex, share }) => {
    const swatch = document.createElement('button');
    swatch.className = 'swatch'; swatch.setAttribute('role', 'listitem');
    swatch.setAttribute('aria-label', `Copy ${hex}, about ${Math.max(1, Math.round(share * 100))}% of the image`);
    swatch.title = `${hex} · ${Math.max(1, Math.round(share * 100))}%`;
    swatch.style.setProperty('background', hex);
    swatch.onclick = async () => { try { await copyText(hex); toast(`${hex} copied.`); } catch { toast('Select the color code and copy it manually.'); } };
    return swatch;
  }));
}
// Puts a small color dot before each hex code in a prompt's palette line. The dots carry no text,
// so the line's textContent (what Copy sends) stays exactly the prompt.
function colorCodes(line) {
  const parts = line.textContent.split(/(#[0-9a-f]{6}\b)/i);
  line.replaceChildren(...parts.map(part => {
    if (!/^#[0-9a-f]{6}$/i.test(part)) return document.createTextNode(part);
    const code = document.createElement('span'), dot = document.createElement('i');
    code.className = 'color-code'; dot.setAttribute('aria-hidden', 'true');
    dot.style.setProperty('background', part); // set from script: the CSP blocks inline style attributes
    code.append(dot, part);
    return code;
  }));
}
// Washes the whole style modal with a light version of the current image's color.
function applyTint() {
  const img = document.querySelectorAll('.hero-slide img')[heroIndex];
  const tint = img && edgeFills.get(img.currentSrc || img.src)?.tint;
  if (tint) $('#style-dialog').style.setProperty('--tint', tint);
  else $('#style-dialog').style.removeProperty('--tint');
  // ::backdrop does not inherit the tint in every browser, so a separate layer behind the modal carries it.
  if (tint) $('#modal-veil').style.setProperty('--tint', tint); else $('#modal-veil').style.removeProperty('--tint');
  // The arrows take the edge fill beside them (the color that continues the image), with ink or light chevrons for contrast.
  const fill = img && edgeFills.get(img.currentSrc || img.src);
  [['prev', fill?.left], ['next', fill?.right]].forEach(([side, bands]) => {
    const nav = $(`.hero-${side}`); if (!nav) return;
    const color = bands?.[bands.length >> 1];
    const rgb = color?.match(/\d+/g)?.map(Number);
    if (!rgb) { nav.style.removeProperty('--nav-fill'); nav.style.removeProperty('--nav-ink'); return; }
    const light = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 > 0.55;
    nav.style.setProperty('--nav-fill', color);
    nav.style.setProperty('--nav-ink', light ? '#1c1f1d' : '#f3f1ea');
  });
}
function paintSlides() {
  applyTint();
  document.querySelectorAll('.hero-slide img').forEach(img => {
    const paint = () => { try { edgeFill(img); applyTint(); showPalette(); } catch {} };
    if (img.complete && img.naturalWidth) paint(); else img.addEventListener('load', paint, { once: true });
  });
}
// Desktop: drag the image with the mouse to move between slides, as a swipe does on phones. A short pull snaps
// back; past 12% of the width it moves one slide. A drag never opens the lightbox.
function dragCarousel(track) {
  if (!track || track.children.length < 2) return;
  track.classList.add('draggable');
  let drag = null, swallowClick = false;
  track.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = { x: event.clientX, left: track.scrollLeft, id: event.pointerId, moved: false };
  });
  track.addEventListener('pointermove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      drag.moved = true; track.setPointerCapture(drag.id); track.classList.add('dragging');
    }
    event.preventDefault();
    track.scrollLeft = drag.left - dx;
  });
  const end = event => {
    const done = drag; drag = null;
    if (!done?.moved) return;
    const dx = event.clientX - done.x, from = Math.round(done.left / track.clientWidth);
    const to = Math.abs(dx) > track.clientWidth * 0.12 ? from + (dx < 0 ? 1 : -1) : from;
    // Ease to the slide ourselves with snapping still off: the browser's smooth scroll is dropped right after a
    // drag, and turning snapping back on mid-glide makes the image jump.
    const index = Math.max(0, Math.min(track.children.length - 1, to));
    const start = track.scrollLeft, target = index * track.clientWidth, began = performance.now();
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
    heroTarget = index;
    const step = now => {
      const k = duration ? Math.min(1, (now - began) / duration) : 1;
      track.scrollLeft = start + (target - start) * (1 - (1 - k) ** 3);
      if (k < 1) requestAnimationFrame(step); else track.classList.remove('dragging');
    };
    requestAnimationFrame(step);
    swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('click', event => { if (swallowClick) { event.stopPropagation(); event.preventDefault(); } }, true);
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
  dragCarousel($('.hero-track'));
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
    try { await copyText(promptText(document.querySelector('.prompt-block:not([hidden])'))); toast('Prompt copied.'); }
    catch { toast('Select the prompt and copy it manually.'); }
  };
  $('#reidentify-image').onclick = reidentifyImage;
  $('#generate-style').onclick = generateFromPrompt;
  $('#generations').onclick = generationClick;
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
  if (!$('#style-dialog').open || $('#edit-dialog').open || generationOpen() || !$('.hero-nav')) return;
  if ($('#lightbox').open && $('#lightbox').dataset.generated) return; // arrows step through references, not test images
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
const generateErrors = new Map(); // imageId -> why the last test generation failed, shown under the button
const retryErrors = new Map();    // generationId -> why the last "Try again" failed, shown in the test dialog
const retrying = new Map();       // imageId -> generationId while a "Try again" for that test runs
const liveJobs = new Map();       // imageId -> latest polled state of its test job (step, log, refined, judged)
const generating = new Map();    // imageId -> 'queued' | server step (generate-1, judge-1, recalibrate, generate-2, judge-2)
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
  } else if (!finished && record.kind === 'generate') {
    generating.set(record.imageId, state.status === 'running' ? state.step || 'running' : 'queued');
    liveJobs.set(record.imageId, state);
    if (record.generationId) retrying.set(record.imageId, record.generationId);
    markGenerating();
  }
  else if (!finished && record.kind === 'review') { reviewing.set(record.imageId, state); renderReview(); }
  else if (!finished) { reidentifying.set(record.imageId, state.status === 'running' ? 'running' : 'queued'); markAnalyzing(); }
  if (!finished) { if (record.kind === 'import') importSummary(); return; }
  appliedJobs.add(record.id); untrackJob(record.id); liveRecords.delete(record.id);
  if (record.kind === 'generate') {
    generating.delete(record.imageId); retrying.delete(record.imageId); liveJobs.delete(record.imageId);
    // The generate routes only answer 404 when the running server predates them.
    const failure = state.status === 'done' ? null : state.status === 'missing' ? 'Test generation was interrupted because Artbook restarted.'
      : state.httpStatus === 404 ? 'Artbook is running an older version without this feature. Close it and start it again.' : state.error;
    // A failed retry is reported inside its test's dialog; a failed new test under the button.
    const errors = record.generationId ? retryErrors : generateErrors, key = record.generationId || record.imageId;
    if (failure) errors.set(key, failure); else errors.delete(key);
    await refresh();
    // Re-render the open modal so the new generation (or attempt) appears, and open it on its newest attempt.
    if ($('#style-dialog').open && selectedImage?.id === record.imageId) {
      reselectImage();
      if (state.status === 'done') {
        showPromptTab('style-prompt');
        const id = record.generationId || selectedImage?.generations?.at(-1)?.id;
        if (id && (!record.generationId || generationOpen())) openGeneration(id, -1);
      }
    } else markGenerating();
    if (generationOpen()) renderRetryStatus();
    if (failure) return toast(failure);
    const generation = state.result.images.find(i => i.id === record.imageId)?.generations?.find(g => g.id === record.generationId) || state.result.images.find(i => i.id === record.imageId)?.generations?.at(-1);
    if (!generation) return toast('Test generation saved.');
    if (record.generationId) return toast(`Attempt ${generation.attempts.length} · ${generation.attempts.at(-1).similarity}% style match.`);
    return toast(`Test generation saved · ${Math.max(...generation.attempts.map(a => a.similarity))}% style match.`);
  }
  if (record.kind === 'review') return finishReview(record, state);
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
  trackJob({ id: live.id, kind: live.kind, name: live.name, styleId: live.styleId, imageId: live.imageId, sourceStyleId: live.sourceStyleId, generationId: live.generationId });
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
      applyJob(live, { status: 'error', error: error.message, duplicate: error.duplicate, httpStatus: error.httpStatus });
    });
  pollJobs();
}
async function pollJobs() {
  if (polling) return; polling = true;
  try {
    while (trackedJobs().length) {
      // A drawing in progress is polled faster so it can be watched as it grows.
      await new Promise(r => setTimeout(r, [...liveJobs.values()].some(s => s.mode === 'vector' && s.status === 'running') ? 600 : 1200));
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
  const style = event.target.closest('[data-style]');
  if (style) showStyle(style.dataset.style, Number(event.target.closest('[data-cover-slide]')?.dataset.coverSlide) || 0);
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
  const inTest = history.state?.artbook === 'test';
  if (generationOpen()) { evidenceView = null; $('#generation-view').hidden = true; $('#style-content').hidden = false; }
  // Closed by the button, Esc or backdrop: drop the history entries pushed on open (and for an open test).
  if (!closingFromHistory && (inTest || history.state?.artbook === 'style')) { skipPop = inTest; history.go(inTest ? -2 : -1); }
  closingFromHistory = false;
});
// The browser/phone back gesture closes the style modal instead of leaving Artbook (phones have no close button).
let closingFromHistory = false;
addEventListener('popstate', () => {
  if (skipPop) { skipPop = false; return; } // our own history.back() after closing a view
  if (generationOpen()) return closeGenerationView(true);
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
  if (generating.has(selectedImage.id)) return toast('This image has a test generation in progress. Delete it when that finishes.');
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
  tracked.filter(j => j.kind === 'review').forEach(record => reviewing.set(record.imageId, { status: 'queued' }));
  tracked.filter(j => j.kind === 'generate').forEach(record => { generating.set(record.imageId, 'queued'); if (record.generationId) retrying.set(record.imageId, record.generationId); });
  markAnalyzing(); markGenerating();
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

// ---- Test generations ----
// "Generate & compare" sends the style prompt (as copied, palette line included) without the image. The server
// generates, rates the style match against this image, and retries once with a refined prompt when the match is low.
// Same rule as the server: a test prompt minus its trailing palette line, whitespace collapsed.
const stylePromptOf = prompt => prompt.replace(/\s*Color palette:[^]*$/i, '').trim().replace(/\s+/g, ' ').slice(0, 1500);
const promptText = panel => [...panel.querySelectorAll(':scope > p:not(.field-hint):not([hidden])')].map(p => p.textContent).filter(Boolean).join('\n\n');
const GENERATE_STEPS = { queued: 'Waiting in line…', running: 'Setting up…', 'generate-1': 'Painting from the prompt…', 'judge-1': 'Critiquing it against the original…', recalibrate: 'Low match. Reworking the prompt…', 'generate-2': 'Painting a second study…', 'judge-2': 'Critiquing the second study…',
  'retry-recalibrate': 'Reworking the prompt from the last critique…', 'generate-retry': 'Painting a new study…', 'judge-retry': 'Critiquing it against the original…',
  'draw-1': 'Sketching the structure…', 'draw-2': 'Laying in color and tone…', 'draw-3': 'Drawing line and detail…', 'draw-4': 'Checking and finishing…', 'judge-vector': 'Critiquing it against the original…',
  'draw-revise': 'Revising the drawing from the critique…', 'judge-revise': 'Critiquing the revision…' };
const DRAWER_NAMES = { claude: 'Claude', codex: 'Codex' };
// The last "Test as" choice is a per-viewer convenience.
const testMode = () => $('input[name="test-mode"]:checked')?.value || 'image';
document.addEventListener('change', event => { if (event.target.name === 'test-mode') { try { localStorage.setItem('artbook-test-mode', event.target.value); } catch {} markGenerating(); } });
const TRAIT_LABELS = { palette: 'Palette', linework: 'Linework', rendering: 'Rendering', texture: 'Texture', lighting: 'Lighting', shapes: 'Shapes' };
document.addEventListener('input', event => {
  if (event.target.id !== 'test-subject') return;
  const field = event.target, typed = field.value.replace(/[\[\]]/g, '').trim();
  const slot = $('#style-prompt .prompt-slot'); if (!slot) return;
  slot.textContent = `[${typed || field.dataset.original}]`;
  slot.classList.toggle('edited', !!typed && typed !== field.dataset.original);
});
document.addEventListener('keydown', event => {
  if (event.target.id === 'test-subject' && event.key === 'Enter') { event.preventDefault(); if (!$('#generate-style').disabled) generateFromPrompt(); }
});
function generateFromPrompt() {
  const image = selectedImage; if (!image || generating.has(image.id)) return;
  const prompt = promptText($('#panel-style-prompt'));
  if (!prompt) return toast('This image has no style prompt yet. Re-identify it first.');
  const mode = testMode(), vector = mode !== 'image';
  generateErrors.delete(image.id); generating.set(image.id, 'queued'); markGenerating();
  sendJob({ id: newJobId(), kind: 'generate', imageId: image.id, live: true }, '/api/generate',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId: image.id, prompt, ...(vector ? { mode: 'vector', drawer: mode } : {}) }) });
}
// Server steps in order; the progress dots fill as each one finishes.
const STEP_ORDER = ['generate-1', 'judge-1', 'recalibrate', 'generate-2', 'judge-2'];
const RETRY_ORDER = ['retry-recalibrate', 'generate-retry', 'judge-retry'];
const VECTOR_ORDER = ['draw-1', 'draw-2', 'draw-3', 'draw-4', 'judge-vector'];
const REVISE_ORDER = ['draw-revise', 'judge-revise'];
// The dots follow the kind of run the step belongs to.
const orderFor = (state, retry) => [VECTOR_ORDER, REVISE_ORDER, RETRY_ORDER, STEP_ORDER].find(order => order.includes(state)) || (retry ? RETRY_ORDER : STEP_ORDER);
// Fills a .step-dots element for the given step: one dot per step of that kind of run.
const dotsFor = (order, at) => order.map((_, n) => `<i class="${n < at ? 'done' : n === at ? 'current' : ''}"></i>`).join('');
function stepDots(box, state, retry) {
  const order = orderFor(state, retry);
  box.hidden = !state;
  box.innerHTML = dotsFor(order, order.indexOf(state));
}
function markGenerating() {
  const button = $('#generate-style'); if (!button) return;
  const state = selectedImage ? generating.get(selectedImage.id) : null;
  const failure = !state && selectedImage ? generateErrors.get(selectedImage.id) : null;
  button.disabled = !!state || !selectedImage?.stylePrompt;
  $('#generate-label').textContent = state === 'queued' ? 'Queued' : state ? 'Testing…' : 'Test this prompt';
  const mode = testMode();
  $('#generate-style').title = mode === 'image' ? 'Uses the prompt only, not this image. Takes a few minutes and uses your Codex allowance.'
    : `${DRAWER_NAMES[mode]} draws the style as vector code from the prompt only, in four stages, then Codex compares it with this image. Takes several minutes and uses your ${DRAWER_NAMES[mode]} and Codex allowance.`;
  $('#generate-progress').hidden = !state && !failure;
  $('#generate-progress').classList.toggle('failed', !!failure);
  $('#generate-status').textContent = state ? GENERATE_STEPS[state] || 'Working…' : failure || '';
  stepDots($('#step-dots'), state, retrying.has(selectedImage?.id));
  const live = state ? liveJobs.get(selectedImage.id) : null;
  const first = live?.judged?.[0] && !retrying.has(selectedImage.id) ? `Attempt 1: ${live.judged[0].similarity}%. ` : '';
  const thought = live?.log?.at(-1)?.text || '';
  $('#generate-thought').textContent = first + thought;
  $('#generate-thought').hidden = !(first || thought);
  renderHeroLive();
  if (generationOpen()) renderRetryStatus();
}
// Refreshes the details of the selected image in place (after the library changed) without rebuilding the carousel.
function reselectImage() {
  const index = styles.find(s => s.id === selectedStyle)?.images.findIndex(i => i.id === selectedImage?.id) ?? -1;
  if (index < 0) return markGenerating();
  selectedImage = null; selectImage(index);
}
// Each test shows as a small thumbnail with its best style match; selecting it opens the test's own dialog.
function renderGenerations() {
  const box = $('#generations'); if (!box) return;
  markGenerating();
  $('#tests').hidden = !selectedImage?.generations?.length;
  box.innerHTML = [...(selectedImage?.generations || [])].reverse().map(g => {
    const best = g.attempts.reduce((a, b) => b.similarity > a.similarity ? b : a);
    return `<button class="generation-chip" data-open-generation="${escape(g.id)}" aria-label="Open test generation, best style match ${best.similarity}%"><img src="/images/generated/${escape(best.filename)}" alt="" loading="lazy"><span>${best.similarity}%</span></button>`;
  }).join('');
  if (generationOpen()) renderGenerationDialog();
}
let openGenerationId = null, openAttempt = -1; // -1 = the newest attempt
const ICONS = {
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 5.5v-.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M4.5 7h15M10 4h4M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12"/>',
  retry: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v3.8h-3.8"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  download: '<path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5M5 19.5h14"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const MAX_TEST_ATTEMPTS = 8; // same cap as the server
const signed = n => n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0';
// One tab per attempt; the open tab shows that attempt beside the original with its reasoning and prompt.
function renderGenerationDialog() {
  const g = selectedImage?.generations?.find(x => x.id === openGenerationId);
  if (!g) return closeGenerationView();
  if (evidenceView) return renderEvidence(g);
  $('#generation-back-label').textContent = styles.find(s => s.id === selectedStyle)?.name || 'Back';
  const target = g.target ?? 70;
  const live = openAttempt === 'live' && !!retryState(g);
  const n = live || openAttempt === 'live' || openAttempt < 0 || openAttempt >= g.attempts.length ? g.attempts.length - 1 : openAttempt;
  // A retry compares with the attempt it reworked; older attempts with the one before.
  const a = g.attempts[n], base = a.basedOn ?? n - 1, before = g.attempts[base];
  const best = g.attempts.reduce((top, x, i) => x.similarity > g.attempts[top].similarity ? i : top, 0);
  const date = new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const applied = stylePromptOf(a.prompt) === selectedImage.stylePrompt;
  const change = a.change || (n === 1 ? g.recalibration : null); // tests saved before per-attempt notes kept one note on the test
  $('#generation-title').textContent = `Test generation · ${date}`;
  $('#generation-content').innerHTML = `
    <p class="form-intro">${g.mode === 'vector' ? `Drawn as vector code${DRAWER_NAMES[g.drawer] ? ` by ${DRAWER_NAMES[g.drawer]}` : ''} from the prompt alone, in four stages, then held against the original.` : 'Painted from the prompt alone, then held against the original.'} Match is the mean of six trait scores.</p>
    <div class="attempt-tabs" role="tablist" aria-label="Attempts">${g.attempts.map((x, i) => `<button role="tab" id="attempt-tab-${i}" aria-controls="attempt-panel" aria-selected="${!live && i === n}" tabindex="${!live && i === n ? 0 : -1}" data-attempt="${i}">
      <span>Attempt ${i + 1}</span><strong class="${x.similarity >= target ? '' : 'match-low'}">${x.similarity}%</strong>${i === best && g.attempts.length > 1 ? '<em>Best</em>' : ''}</button>`).join('')}
      <button role="tab" class="attempt-pending" id="attempt-tab-live" aria-controls="attempt-panel" aria-selected="${live}" tabindex="${live ? 0 : -1}" data-attempt="live" hidden><span>Attempt ${g.attempts.length + 1}</span><i></i></button></div>
    <div id="attempt-panel" role="tabpanel" aria-labelledby="attempt-tab-${live ? 'live' : n}">${live ? '<div class="live-attempt" id="live-attempt"></div>' : `
      <div class="generation-compare">
        <figure class="attempt"><button class="attempt-image" data-generated aria-label="View the original larger"><img src="${imageURL(selectedImage)}" alt="Original reference"></button><figcaption><strong>Original</strong></figcaption></figure>
        <figure class="attempt"><button class="attempt-image" data-generated aria-label="View attempt ${n + 1} larger"><img id="attempt-art" src="/images/generated/${escape(a.filename)}" alt="${a.kind === 'vector' ? 'Drawn' : 'Generated'} in attempt ${n + 1}"></button>
          <figcaption><strong class="${a.similarity >= target ? '' : 'match-low'}">${a.similarity}% style match</strong>${before ? `<span>${signed(a.similarity - before.similarity)} from attempt ${base + 1}</span>` : '<span>Prompt as written</span>'}${a.kind === 'vector' ? `<span class="vector-tag">Vector${DRAWER_NAMES[a.drawer] ? ` · ${DRAWER_NAMES[a.drawer]}` : ''}</span>` : ''}</figcaption></figure>
      </div>
      ${a.stages?.length > 1 ? processStrip(a) : ''}
      ${n === g.attempts.length - 1 && g.error ? `<p class="error">${escape(g.error)}</p>` : ''}
      <div class="generation-notes">
        <section>
          ${change ? `<h3>Adjustments</h3><p>${escape(change)}</p>` : ''}
          <h3>Critique</h3>${a.summary ? `<p>${escape(a.summary)}</p>` : ''}
          ${a.differences.length ? `<ul>${a.differences.map((d, i) => `<li>${evidenceText(d, i, a, 'differences')}</li>`).join('')}</ul>` : ''}
          ${a.strengths?.length ? `<h3>What works</h3><ul class="strengths">${a.strengths.map((d, i) => `<li>${evidenceText(d, i, a, 'strengths')}</li>`).join('')}</ul>` : ''}
        </section>
        <section>
          <h3>Trait scores</h3>
          <dl class="trait-scores">${Object.entries(a.scores).map(([trait, score]) => {
            const delta = before ? score - (before.scores[trait] ?? score) : 0;
            return `<div><dt>${TRAIT_LABELS[trait] || escape(trait)}</dt><dd>${score}${before && delta ? `<span class="${delta > 0 ? 'up' : 'down'}">${signed(delta)}</span>` : ''}</dd></div>`;
          }).join('')}</dl>
          <details><summary>Prompt used</summary><p class="generation-prompt">${escape(a.prompt)}</p></details>
          <div class="attempt-actions">
            <button class="text-button dialog-action" data-copy-generation="${n}">${icon('copy')}Copy prompt</button>
            ${a.kind === 'vector' ? `<a class="text-button dialog-action" href="/images/generated/${escape(a.svg)}" download="artbook-drawing-${n + 1}.svg">${icon('download')}Download SVG</a>` : ''}
            ${applied ? `<span class="dialog-action generation-applied">${icon('check')}This is the style prompt</span>`
              : `<button class="text-button dialog-action" data-use-prompt="${n}">${icon('check')}Use as style prompt</button>`}
          </div>
        </section>
      </div>`}
    </div>
    <div class="generation-actions">
      <button class="text-button dialog-action danger-action" id="delete-generation">${icon('trash')}<span>Delete test</span></button>
      <div class="retry-box"><span class="retry-status" id="retry-status" role="status"></span><span class="step-dots" id="retry-dots" aria-hidden="true" hidden></span>
        <button class="primary retry-button" id="retry-generation">${icon('retry')}<span id="retry-label">Try again</span></button></div>
    </div>
    <section class="review-box" id="review-box" aria-labelledby="review-title"></section>`;
  renderRetryStatus();
  renderReview();
  $('#generation-content').querySelectorAll('.generation-prompt').forEach(colorCodes);
}
// A staged drawing's process: one thumbnail per stage; choosing one shows that stage in place of the finished drawing.
const STAGE_LABELS = ['Sketch', 'Color and tone', 'Line and detail', 'Finish'];
function processStrip(a) {
  const last = a.stages.length - 1;
  return `<section class="process" aria-labelledby="process-title">
      <div class="process-head"><h3 id="process-title">Process</h3>${a.svg ? `<button class="text-button dialog-action" id="play-drawing">${icon('play')}<span>Play</span></button>` : ''}</div>
      <div class="process-strip" role="group" aria-label="Drawing stages">${a.stages.map((st, i) => `<button class="process-step" data-stage="${i}" aria-pressed="${i === last}"><span class="process-thumb"><img src="/images/generated/${escape(st.render || st.filename)}" alt="" loading="lazy"></span><span>${i + 1} · ${STAGE_LABELS[i] || `Stage ${i + 1}`}</span></button>`).join('')}</div>
      <p class="process-note" id="process-note">${escape(a.stages[last].note || '')}</p>
    </section>`;
}
function showStage(button, attempt) {
  const stage = attempt.stages[Number(button.dataset.stage)]; if (!stage) return;
  $('#attempt-art').src = `/images/generated/${stage.render || stage.filename}`;
  $('#process-note').textContent = stage.note || '';
  button.parentElement.querySelectorAll('.process-step').forEach(b => b.setAttribute('aria-pressed', b === button));
}
// ---- Watching a drawing ----
// While a drawing test runs, the drawing so far (finished layers plus the complete part of the layer being written)
// is fetched as an image whenever its version changes, and shown over the reference and in the live tab.
const LAYER_ORDER = ['sketch', 'color', 'line', 'finish'];
const liveArt = { job: null, version: 0, url: null, loading: false };
async function refreshLiveArt(live) {
  if (live?.mode !== 'vector' || !live.liveVersion) return;
  if (liveArt.job !== live.id) { if (liveArt.url) URL.revokeObjectURL(liveArt.url); Object.assign(liveArt, { job: live.id, version: 0, url: null }); }
  if (liveArt.loading || live.liveVersion === liveArt.version) return paintLiveArt();
  liveArt.loading = true;
  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(live.id)}/drawing`);
    if (response.ok) {
      const url = URL.createObjectURL(await response.blob()), img = new Image();
      img.src = url; await img.decode().catch(() => {});
      if (liveArt.job === live.id) { if (liveArt.url) URL.revokeObjectURL(liveArt.url); liveArt.url = url; liveArt.version = live.liveVersion; } else URL.revokeObjectURL(url);
    }
  } catch {} finally { liveArt.loading = false; }
  paintLiveArt();
}
function paintLiveArt() {
  if (!liveArt.url) return;
  for (const el of [$('#hero-live-art'), $('#live-art')]) if (el && el.src !== liveArt.url) el.src = liveArt.url;
}
const layerStep = layer => { const n = LAYER_ORDER.indexOf(layer); return n < 0 ? '' : ` · ${n + 1}/4 ${STAGE_LABELS[n]}`; };
let heroPeek = null; // job id whose live drawing the viewer set aside to see the original
function renderHeroLive() {
  const box = $('#hero-live'); if (!box || !selectedImage) return;
  const running = generating.get(selectedImage.id);
  const live = running && !retrying.has(selectedImage.id) ? liveJobs.get(selectedImage.id) : null;
  box.hidden = !(live?.mode === 'vector' && live.liveVersion);
  if (box.hidden) return;
  const peek = heroPeek === live.id;
  box.classList.toggle('peek', peek);
  $('#hero-live-label').textContent = `Drawing live${layerStep(live.liveLayer)}`;
  $('#hero-live-toggle').textContent = peek ? 'Show drawing' : 'Show original';
  refreshLiveArt(live);
}
document.addEventListener('click', event => {
  if (!event.target.closest('#hero-live-toggle')) return;
  const live = selectedImage && liveJobs.get(selectedImage.id);
  heroPeek = heroPeek === live?.id ? null : live?.id ?? null;
  renderHeroLive();
});

// Replay: the finished drawing rebuilt shape by shape, in the order it was drawn, layer after layer.
let replay = null;
async function playDrawing(attempt) {
  if (replay) return replay.stop();
  if (!attempt?.svg) return;
  let text;
  try { text = await (await fetch(`/images/generated/${attempt.svg}`)).text(); } catch { return toast('The drawing could not be loaded.'); }
  const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  if (svg.nodeName !== 'svg') return toast('The drawing could not be loaded.');
  // Every visible shape, in drawing order, wherever it sits (groups stay; shapes inside defs, symbols or patterns are not steps).
  const SHAPES = 'path,line,polyline,polygon,rect,circle,ellipse,use';
  const units = [...svg.querySelectorAll(SHAPES)].filter(el => !el.closest('defs,symbol,pattern,clipPath,mask,marker'))
    .map(el => ({ el, layer: el.closest('[id^="layer-"]')?.id.slice(6) || null, display: el.getAttribute('display') }));
  if (!units.length) return;
  units.forEach(u => u.el.setAttribute('display', 'none'));
  // The construction sketch is drawn at full strength first, then fades to its finished opacity at the end, as it was made.
  const sketch = svg.querySelector('#layer-sketch'), sketchFinal = sketch ? Number(sketch.getAttribute('opacity') ?? 1) : 1;
  sketch?.removeAttribute('opacity');
  const finalSrc = $('#attempt-art').src, finalNote = $('#process-note').textContent;
  let stopped = false, url = null;
  const show = async () => {
    const next = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    const img = new Image(); img.src = next; await img.decode().catch(() => {});
    const art = $('#attempt-art'); if (!art || stopped) { URL.revokeObjectURL(next); return false; }
    art.src = next; if (url) URL.revokeObjectURL(url); url = next;
    return true;
  };
  replay = { stop: () => { stopped = true; } };
  const label = playing => { const b = $('#play-drawing'); if (b) b.innerHTML = `${icon(playing ? 'stop' : 'play')}<span>${playing ? 'Stop' : 'Play'}</span>`; };
  label(true);
  const steps = Math.min(90, units.length);
  let shown = 0;
  try {
    for (let step = 1; step <= steps && !stopped; step++) {
      const started = performance.now(), upto = Math.ceil(units.length * step / steps);
      for (; shown < upto; shown++) { const u = units[shown]; if (u.display === null) u.el.removeAttribute('display'); else u.el.setAttribute('display', u.display); }
      if (!(await show())) break;
      const note = $('#process-note'); if (note) note.textContent = `Replaying${layerStep(units[shown - 1].layer)} · ${shown} of ${units.length} shapes`;
      await new Promise(r => setTimeout(r, Math.max(0, 140 - (performance.now() - started))));
    }
    if (sketch && sketchFinal < 1) {
      const note = $('#process-note'); if (note && !stopped) note.textContent = 'Fading the construction sketch';
      for (let f = 1; f <= 8 && !stopped; f++) { sketch.setAttribute('opacity', (1 - (1 - sketchFinal) * f / 8).toFixed(2)); await show(); await new Promise(r => setTimeout(r, 90)); }
    }
    if (!stopped) await new Promise(r => setTimeout(r, 900));
  } finally {
    const art = $('#attempt-art'), note = $('#process-note');
    if (art) art.src = finalSrc;
    if (note) note.textContent = finalNote;
    setTimeout(() => url && URL.revokeObjectURL(url), 1000);
    replay = null; label(false);
  }
}
// The polled step of a "Try again" running for this test, or null.
const retryState = g => selectedImage && retrying.get(selectedImage.id) === g.id ? generating.get(selectedImage.id) || null : null;
// The attempt in progress: the refined prompt and its change as soon as they exist, then Codex's reasoning lines as they arrive.
function liveAttempt(step) {
  const state = liveJobs.get(selectedImage.id) || {}, refined = state.refined;
  if (state.mode === 'vector') return liveDrawing(state, step);
  const notes = (state.log || []).map(l => `<li>${escape(l.text)}</li>`).join('');
  const now = step === 'queued' ? 'Waiting in line' : GENERATE_STEPS[step]?.replace(/…$/, '') || 'Starting';
  return `<div class="generation-notes">
      <section>
        <h3>Adjustments</h3><p>${refined?.change ? escape(refined.change) : refined ? 'Refined.' : '<span class="muted">Reading the last critique…</span>'}</p>
        ${refined ? `<h3>Reworked prompt</h3><p class="generation-prompt live-prompt">${escape(refined.prompt)}</p>` : ''}
      </section>
      <section>
        <h3>Studio notes</h3>
        <ul class="live-log">${notes}<li class="live-now">${escape(now)}${orderFor(step, true).includes(step) ? `<span class="step-dots" aria-hidden="true">${dotsFor(orderFor(step, true), orderFor(step, true).indexOf(step))}</span>` : '<i></i>'}</li></ul>
      </section>
    </div>`;
}
// Polling rebuilds the live attempt only when its content changed, and keeps the scroll of its prompt and notes,
// so reading the reworked prompt is not thrown back to the top every second.
function updateLiveAttempt(box, step) {
  const html = liveAttempt(step);
  if (box.dataset.source === html) return;
  const kept = ['.live-prompt', '.live-log'].map(selector => [selector, box.querySelector(selector)?.scrollTop || 0]);
  box.innerHTML = html; box.dataset.source = html;
  box.querySelectorAll('.generation-prompt').forEach(colorCodes);
  for (const [selector, top] of kept) { const el = box.querySelector(selector); if (el) el.scrollTop = top; }
}
// A drawing in progress: its newest stage as soon as it exists, the drawer's notes, then the critique's reasoning.
function liveDrawing(state, step) {
  const stages = state.stages || [], latest = stages.at(-1);
  const notes = [...stages.map(st => st.note).filter(Boolean), ...(state.log || []).map(l => l.text)].map(text => `<li>${escape(text)}</li>`).join('');
  const now = step === 'queued' ? 'Waiting in line' : GENERATE_STEPS[step]?.replace(/…$/, '') || 'Starting';
  const order = orderFor(step, true);
  return `<div class="generation-notes">
      <section>${latest || state.liveVersion ? `<figure class="attempt live-drawing"><div class="attempt-image"><img id="live-art" src="${liveArt.url && liveArt.job === state.id ? liveArt.url : latest ? `/images/generated/${escape(latest.render || latest.filename)}` : ''}" alt="Drawing in progress"></div></figure>` : '<p class="muted">Reading the last critique…</p>'}</section>
      <section><h3>Studio notes</h3><ul class="live-log">${notes}<li class="live-now">${escape(now)}${order.includes(step) ? `<span class="step-dots" aria-hidden="true">${dotsFor(order, order.indexOf(step))}</span>` : '<i></i>'}</li></ul></section>
    </div>`;
}
// Updates only the dialog's progress (polled while a retry runs), leaving open disclosures and scroll alone.
function renderRetryStatus() {
  const g = selectedImage?.generations?.find(x => x.id === openGenerationId), button = $('#retry-generation');
  if (!g || !button) return;
  const running = retryState(g);
  // The live tab closes itself when the run ends (the finished attempt then opens in its own tab).
  if (!running && openAttempt === 'live') { openAttempt = -1; return renderGenerationDialog(); }
  if (running && openAttempt === 'live' && !$('#live-attempt')) return renderGenerationDialog();
  if ($('#live-attempt')) { updateLiveAttempt($('#live-attempt'), running); refreshLiveArt(liveJobs.get(selectedImage.id)); }
  const otherJob = !running && generating.has(selectedImage.id);
  const full = g.attempts.length >= MAX_TEST_ATTEMPTS;
  const failure = !running ? retryErrors.get(g.id) : null;
  button.disabled = !!running || otherJob || full;
  const from = viewedAttempt(g);
  $('#retry-label').textContent = running === 'queued' ? 'Queued' : running ? 'Trying again…' : from === g.attempts.length - 1 ? 'Try again' : `Try again from attempt ${from + 1}`;
  const drawing = g.attempts[from]?.kind === 'vector';
  button.title = full ? `A test keeps at most ${MAX_TEST_ATTEMPTS} attempts. Start a new test from the prompt tab.`
    : drawing ? `Revises this drawing from its critique, then compares again. Takes a few minutes and uses your ${DRAWER_NAMES[g.drawer] || 'drawing'} and Codex allowance.`
    : 'Refines the newest prompt, generates once more and compares. Takes a few minutes and uses your Codex allowance.';
  const status = $('#retry-status');
  // While the live tab is open its studio notes already show the current step and its progress dots; don't repeat them beside the button.
  const liveOpen = !!$('#live-attempt');
  status.textContent = running ? (liveOpen ? '' : GENERATE_STEPS[running] || 'Working…') : failure || (full ? `${MAX_TEST_ATTEMPTS} attempts, the most a test keeps` : otherJob ? 'Another test is running for this image' : '');
  status.classList.toggle('failed', !!failure);
  stepDots($('#retry-dots'), running && !liveOpen && running !== 'queued' && running !== 'running' ? running : null, true);
  $('#attempt-tab-live').hidden = !running;
  $('#delete-generation').disabled = !!running;
  renderReview();
}
// Re-rendering removes the focused control; keep focus on the open tab rather than letting it fall to the close button.
const focusAttemptTab = () => $('#generation-content [role=tab][aria-selected=true]')?.focus({ preventScroll: true });
// A difference with its evidence phrase as a link that opens the matching crops of both images.
const proofFor = (attempt, list, index) => (attempt.evidence || []).find(e => (e.list || 'differences') === list && e.difference === index);
function evidenceText(note, index, attempt, list) {
  const proof = proofFor(attempt, list, index);
  const at = proof ? note.toLowerCase().indexOf(proof.phrase.toLowerCase()) : -1;
  if (at < 0) return escape(note);
  const words = note.slice(at, at + proof.phrase.length);
  return `${escape(note.slice(0, at))}<button class="evidence-link" data-evidence="${index}" data-list="${list}" aria-haspopup="dialog" title="Show where">${escape(words)}<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/></svg></button>${escape(note.slice(at + proof.phrase.length))}`;
}
const loadImage = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
// Draws the region (fractions of the image, padded a little) into the canvas at up to `width` CSS pixels.
function drawCrop(canvas, img, box, width) {
  const pad = 0.04, W = img.naturalWidth, H = img.naturalHeight;
  const x = Math.max(0, box.x - pad) * W, y = Math.max(0, box.y - pad) * H;
  const w = Math.min(W - x, (box.w + pad * 2) * W), h = Math.min(H - y, (box.h + pad * 2) * H);
  const scale = Math.min(width / w, 1.6 * width / Math.max(w, h)), dpr = devicePixelRatio || 1;
  canvas.width = Math.round(w * scale * dpr); canvas.height = Math.round(h * scale * dpr);
  canvas.style.setProperty('aspect-ratio', `${w} / ${h}`);
  canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
}
// The whole image, small, with the region outlined so the crop has context.
function drawContext(canvas, img, box, width) {
  const dpr = devicePixelRatio || 1, scale = width / img.naturalWidth;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(img.naturalHeight * scale * dpr);
  canvas.style.setProperty('aspect-ratio', `${img.naturalWidth} / ${img.naturalHeight}`);
  const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const r = [box.x * canvas.width, box.y * canvas.height, box.w * canvas.width, box.h * canvas.height];
  ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#ffffffe6'; ctx.strokeRect(...r);
  ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = '#1c1f1d'; ctx.strokeRect(...r);
}
// Evidence opens as a view inside the test dialog (not a dialog on top); Back returns to the attempt where it was.
let evidenceView = null, evidenceScroll = 0; // { n, index, list } while the evidence view shows
function openEvidence(generation, n, index, list = 'differences') {
  if (!proofFor(generation.attempts[n], list, index)) return;
  evidenceScroll = viewScroller().scrollTop;
  evidenceView = { n, index, list };
  renderGenerationDialog();
  viewScroller().scrollTop = 0;
  $('#generation-back').focus({ preventScroll: true });
}
function closeEvidence() {
  const from = evidenceView; if (!from) return;
  evidenceView = null;
  renderGenerationDialog();
  viewScroller().scrollTop = evidenceScroll;
  $(`#generation-content [data-evidence="${from.index}"][data-list="${from.list}"]`)?.focus({ preventScroll: true });
}
async function renderEvidence(generation) {
  const { n, index, list } = evidenceView, attempt = generation.attempts[n], proof = proofFor(attempt, list, index);
  if (!proof) { evidenceView = null; return renderGenerationDialog(); }
  $('#generation-title').textContent = proof.phrase.charAt(0).toUpperCase() + proof.phrase.slice(1);
  $('#generation-back-label').textContent = `Attempt ${n + 1}`;
  $('#generation-content').innerHTML = `
    <p class="evidence-note">${list === 'strengths' ? '<span class="evidence-kind">Works · </span>' : ''}${escape(attempt[list][index])}</p>
    <div class="evidence-pair">
      <figure><canvas id="crop-original" role="img" aria-label="Detail of the original"></canvas><figcaption><canvas id="context-original" aria-hidden="true"></canvas><span>Original</span></figcaption></figure>
      <figure><canvas id="crop-generated" role="img" aria-label="Detail of attempt ${n + 1}"></canvas><figcaption><canvas id="context-generated" aria-hidden="true"></canvas><span>Attempt ${n + 1}</span></figcaption></figure>
    </div>`;
  try {
    const [original, made] = await Promise.all([loadImage(imageURL(selectedImage)), loadImage(`/images/generated/${attempt.filename}`)]);
    if (!$('#crop-original')) return; // the view changed while the images loaded
    // Side by side the crops share the width; stacked on phones each gets all of it.
    const room = $('#generation-content').clientWidth, stacked = matchMedia('(max-width: 700px)').matches;
    const width = stacked ? Math.min(700, room) : Math.min(440, (room - 16) / 2);
    drawCrop($('#crop-original'), original, proof.original, width); drawCrop($('#crop-generated'), made, proof.generated, width);
    drawContext($('#context-original'), original, proof.original, 44); drawContext($('#context-generated'), made, proof.generated, 44);
  } catch { $('#generation-content').insertAdjacentHTML('beforeend', '<p class="error">The images could not be loaded.</p>'); }
}
// A test opens as a view inside the style modal (never a modal on top): Back, Escape or the browser back gesture
// step out of the evidence view, then out of the test, before anything closes the modal.
const generationOpen = () => !$('#generation-view').hidden;
// On desktop the view scrolls inside the fixed-height modal; on phones the full-screen modal itself scrolls.
const viewScroller = () => matchMedia('(min-width: 900px)').matches ? $('#generation-view') : $('#style-dialog');
let styleScroll = 0;
function openGeneration(id, attempt = -1) {
  openGenerationId = id; openAttempt = attempt; evidenceView = null;
  const wasOpen = generationOpen();
  if (!wasOpen) { styleScroll = $('#style-dialog').scrollTop; $('#style-content').hidden = true; $('#generation-view').hidden = false; history.pushState({ artbook: 'test' }, ''); }
  renderGenerationDialog();
  viewScroller().scrollTop = 0;
  if (wasOpen) focusAttemptTab(); else $('#generation-back').focus({ preventScroll: true });
}
let skipPop = false;
function closeGenerationView(fromHistory = false) {
  if (!generationOpen()) return;
  evidenceView = null;
  $('#generation-view').hidden = true; $('#style-content').hidden = false;
  $('#style-dialog').scrollTop = styleScroll;
  $('#tests')?.querySelector(`[data-open-generation="${CSS.escape(openGenerationId || '')}"]`)?.focus({ preventScroll: true });
  if (!fromHistory && history.state?.artbook === 'test') { skipPop = true; history.back(); }
}
$('#generation-back').onclick = () => evidenceView ? closeEvidence() : closeGenerationView();
$('#style-dialog').addEventListener('cancel', event => {
  if (!generationOpen()) return;
  event.preventDefault();
  if (evidenceView) closeEvidence(); else closeGenerationView();
});
function generationClick(event) {
  const chip = event.target.closest('[data-open-generation]');
  if (chip) openGeneration(chip.dataset.openGeneration);
}
function selectAttempt(value) {
  replay?.stop();
  openAttempt = value === 'live' ? 'live' : Number(value);
  renderGenerationDialog(); $(`#attempt-tab-${value}`)?.focus();
}
// The attempt the open tab shows (the newest when the live tab or nothing specific is open).
const viewedAttempt = g => Number.isInteger(openAttempt) && openAttempt >= 0 && openAttempt < g.attempts.length ? openAttempt : g.attempts.length - 1;
// Try again reworks the attempt being viewed, so a weaker latest attempt need not be the starting point.
function retryGeneration(generation) {
  const imageId = selectedImage.id;
  if (generating.has(imageId)) return;
  const from = viewedAttempt(generation);
  retryErrors.delete(generation.id); generating.set(imageId, 'queued'); retrying.set(imageId, generation.id);
  if (generation.attempts[from].kind === 'vector') liveJobs.set(imageId, { mode: 'vector' }); else liveJobs.delete(imageId);
  openAttempt = 'live'; markGenerating(); renderGenerationDialog(); focusAttemptTab();
  sendJob({ id: newJobId(), kind: 'generate', imageId, generationId: generation.id, live: true },
    `/api/images/${encodeURIComponent(imageId)}/generations/${encodeURIComponent(generation.id)}/retry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from }) });
}
$('#generation-content').addEventListener('keydown', event => {
  const tab = event.target.closest('[data-attempt]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...$('#generation-content').querySelectorAll('[data-attempt]:not([hidden])')], at = tabs.indexOf(tab);
  const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
  event.preventDefault(); selectAttempt(next.dataset.attempt);
});
$('#generation-content').addEventListener('click', async event => {
  const generation = selectedImage?.generations?.find(g => g.id === openGenerationId); if (!generation) return;
  const tab = event.target.closest('[data-attempt]');
  if (tab) return selectAttempt(tab.dataset.attempt);
  if (event.target.closest('#play-drawing')) return playDrawing(generation.attempts[viewedAttempt(generation)]);
  const stage = event.target.closest('[data-stage]');
  if (stage) return showStage(stage, generation.attempts[viewedAttempt(generation)]);
  const view = event.target.closest('[data-generated]');
  if (view) return openGeneratedLightbox(view);
  const proof = event.target.closest('[data-evidence]');
  if (proof) return openEvidence(generation, viewedAttempt(generation), Number(proof.dataset.evidence), proof.dataset.list);
  if (event.target.closest('#retry-generation')) return retryGeneration(generation);
  if (event.target.closest('#review-start')) return startReview();
  const decision = event.target.closest('[data-review]');
  if (decision) return resolveReview(decision);
  const copy = event.target.closest('[data-copy-generation]');
  if (copy) {
    try { await copyText(generation.attempts[Number(copy.dataset.copyGeneration)].prompt); toast('Prompt copied.'); }
    catch { toast('Select the prompt and copy it manually.'); }
    return;
  }
  const use = event.target.closest('[data-use-prompt]');
  if (use) {
    use.disabled = true;
    try {
      await api(`/api/images/${encodeURIComponent(selectedImage.id)}/generations/${encodeURIComponent(generation.id)}/use-prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attempt: Number(use.dataset.usePrompt) }) });
      const keep = openAttempt;
      await refresh(); reselectImage(); openAttempt = keep; renderGenerationDialog(); toast('Style prompt updated.');
    } catch (error) { use.disabled = false; toast(error.message); }
    return;
  }
  const remove = event.target.closest('#delete-generation'); if (!remove) return;
  const label = remove.querySelector('span');
  if (!remove.classList.contains('armed')) {
    remove.classList.add('armed'); label.textContent = 'Click again to delete';
    setTimeout(() => { remove.classList.remove('armed'); label.textContent = 'Delete test'; }, 4000);
    return;
  }
  remove.disabled = true;
  try {
    await api(`/api/images/${encodeURIComponent(selectedImage.id)}/generations/${encodeURIComponent(generation.id)}`, { method: 'DELETE' });
    closeGenerationView();
    await refresh(); reselectImage(); toast('Test generation deleted.');
  } catch (error) { remove.disabled = false; toast(error.message); }
});
// ---- Identification check ----
// Codex looks at the image again with every test's critic notes and proposes changes to the style name, tags and
// collection, each with a confidence and a reason. Nothing changes until the user applies a proposal.
const reviewing = new Map();    // imageId -> latest polled state of its identification check
const reviewErrors = new Map(); // imageId -> why the last check failed
const REVIEW_FIELDS = ['name', 'tags', 'collection'];
const REVIEW_LABELS = { name: 'Style name', tags: 'Tags', collection: 'Collection' };
function reviewProposal(field, p, style) {
  let change;
  if (field === 'tags') {
    const from = new Set(p.from || []), to = new Set(p.value);
    change = `<span class="review-tags">${[...p.value.map(t => `<span class="${from.has(t) ? 'kept' : 'added'}">${escape(t)}</span>`), ...[...from].filter(t => !to.has(t)).map(t => `<s class="removed">${escape(t)}</s>`)].join('')}</span>`;
  } else change = `<span class="review-from">${escape(p.from || '')}</span><span class="review-arrow" aria-label="to">→</span><strong>${escape(p.value)}</strong>`;
  const count = style?.images.length || 1;
  const apply = field === 'tags' ? 'Apply tags' : field === 'name' ? 'Rename collection' : p.styleId ? `Move to “${p.value}”` : 'Move to a new collection';
  // Same rule as the server: the collection's tags follow when they are exactly this image's old tags.
  const collectionTags = style?.tags || [], from = p.from || [];
  const follows = count === 1 || (collectionTags.length === from.length && collectionTags.every(t => from.includes(t)));
  const note = field === 'name' && count > 1 ? `<p class="review-note">Renames it for all ${count} images in the collection.</p>`
    : field === 'tags' && count > 1 ? `<p class="review-note">${follows ? 'Also updates the collection’s tags, which came from this image.' : 'Changes this image’s tags only; the collection keeps its own.'}</p>` : '';
  const done = p.state && `<p class="review-done">${icon(p.state === 'applied' ? 'check' : 'close')}${p.state === 'applied' ? 'Applied' : 'Dismissed'}</p>`;
  return `<li class="review-item"${p.state ? ` data-state="${p.state}"` : ''}>
      <div class="review-head"><h4>${REVIEW_LABELS[field]}</h4><span class="review-confidence" data-confidence="${escape(p.confidence)}">${escape(p.confidence)} confidence</span></div>
      <p class="review-change">${change}</p>
      ${p.reason ? `<p class="review-reason">${escape(p.reason)}</p>` : ''}
      ${done || `${note}<div class="review-actions"><button class="text-button dialog-action" data-review="${field}" data-action="apply">${icon('check')}${escape(apply)}</button><button class="text-button dialog-action review-dismiss" data-review="${field}" data-action="dismiss">Dismiss</button></div>`}
    </li>`;
}
function reviewSection() {
  const image = selectedImage, style = styles.find(s => s.id === selectedStyle);
  const live = reviewing.get(image.id), r = image.review, failure = !live && reviewErrors.get(image.id);
  const other = !live && (generating.has(image.id) || reidentifying.has(image.id));
  let body = '';
  if (live) {
    const notes = (live.log || []).map(l => `<li>${escape(l.text)}</li>`).join('');
    body = `<ul class="live-log review-log">${notes}<li class="live-now">${live.status === 'running' ? 'Looking at the image again' : 'Waiting in line'}<i></i></li></ul>`;
  } else if (r) {
    const open = REVIEW_FIELDS.filter(f => r[f]?.change), held = REVIEW_FIELDS.filter(f => !r[f]?.change && r[f]?.reason);
    body = `${r.summary ? `<p class="review-summary">${escape(r.summary)}</p>` : ''}
      ${open.length ? `<ul class="review-list">${open.map(f => reviewProposal(f, r[f], style)).join('')}</ul>` : '<p class="review-summary">No changes suggested.</p>'}
      ${held.length ? `<details class="review-held"><summary>What holds</summary><ul>${held.map(f => `<li><strong>${REVIEW_LABELS[f]}.</strong> ${escape(r[f].reason)}</li>`).join('')}</ul></details>` : ''}`;
  }
  const label = live ? (live.status === 'running' ? 'Checking…' : 'Queued') : r ? 'Check again' : 'Check identification';
  const status = other ? 'Another job is running for this image' : r && !live ? `Checked ${new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';
  return `<h3 id="review-title">Identification check</h3>
    <p class="review-intro">Looks at this image again with what its tests found, then suggests changes to its style name, tags and collection. Nothing changes until you apply it.</p>
    ${body}${failure ? `<p class="error">${escape(failure)}</p>` : ''}
    <div class="review-start"><span class="retry-status">${status}</span>
      <button class="text-button dialog-action" id="review-start"${live || other ? ' disabled' : ''} title="Takes a minute or two and uses your Codex allowance.">${icon('search')}${label}</button></div>`;
}
// Rebuilt only when its content changes, so polling does not close "What holds" or reset focus.
function renderReview(force = false) {
  const box = $('#review-box'); if (!box || !selectedImage) return;
  const html = reviewSection();
  if (!force && box.dataset.source === html) return;
  box.innerHTML = html; box.dataset.source = html;
}
function startReview() {
  const imageId = selectedImage.id;
  if (reviewing.has(imageId)) return;
  reviewErrors.delete(imageId); reviewing.set(imageId, { status: 'queued' }); renderReview();
  sendJob({ id: newJobId(), kind: 'review', imageId, live: true }, `/api/images/${encodeURIComponent(imageId)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}
async function finishReview(record, state) {
  reviewing.delete(record.imageId);
  const failure = state.status === 'done' ? null : state.status === 'missing' ? 'The identification check was interrupted because Artbook restarted.'
    : state.httpStatus === 404 ? 'Artbook is running an older version without this feature. Close it and start it again.' : state.error;
  if (failure) reviewErrors.set(record.imageId, failure); else reviewErrors.delete(record.imageId);
  await refresh();
  if ($('#style-dialog').open && selectedImage?.id === record.imageId) reselectImage();
  if (failure) return toast(failure);
  const review = state.result?.images?.find(i => i.id === record.imageId)?.review;
  const count = REVIEW_FIELDS.filter(f => review?.[f]?.change).length;
  toast(count ? `Identification check: ${count} suggestion${count > 1 ? 's' : ''}.` : 'Identification check: the labels hold.');
}
// Applying can rename or change the collection, so the collection view is rebuilt around the image, with the test still open.
async function resolveReview(button) {
  const field = button.dataset.review, action = button.dataset.action, imageId = selectedImage.id;
  $('#review-box').querySelectorAll('button').forEach(b => { b.disabled = true; });
  try {
    const style = await api(`/api/images/${encodeURIComponent(imageId)}/review/${field}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const keep = openAttempt;
    await refresh();
    selectedImage = null;
    showStyle(style.id, Math.max(0, style.images.findIndex(i => i.id === imageId)));
    openAttempt = keep; renderGenerationDialog();
    toast(action === 'dismiss' ? 'Suggestion dismissed.' : field === 'tags' ? 'Tags updated.' : field === 'name' ? `Collection renamed to “${style.name}”.` : `Moved to “${style.name}”.`);
  } catch (error) { toast(error.message); renderReview(true); }
}
function openGeneratedLightbox(button) {
  const img = $('#lightbox-image'), source = button.querySelector('img');
  img.alt = source.alt; img.onload = fitLightbox; img.src = source.src;
  if (img.complete) fitLightbox();
  const tint = $('#style-dialog').style.getPropertyValue('--tint');
  if (tint) $('#lightbox').style.setProperty('--tint', tint); else $('#lightbox').style.removeProperty('--tint');
  $('#lightbox').dataset.generated = '1';
  if (!$('#lightbox').open) $('#lightbox').showModal();
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
