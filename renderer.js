const STORAGE_KEY = 'qu-meta-posts-v1';
const SETTINGS_KEY = 'qu-meta-settings-v1';
const TEMPLATES_KEY = 'qu-meta-templates-v1';
const DEFAULT_GIPHY_API_KEY = 'TOyqr4LUoPDVVf3V7780Lnv94GHUy5xP';
let posts = read(STORAGE_KEY, []);
let settings = read(SETTINGS_KEY, {});
let templates = read(TEMPLATES_KEY, []);
let editingId = null;
let media = [];
let previewPlatform = 'instagram';
let calendarDate = new Date();
let editingMediaId = null;
let cropImage = null;
let cropFilter = 'normal';
let storyMedia = null;
let storySourceId = null;
let storyImage = null;
let storyTextPoint = { x: .5, y: .5 };
let storyStickers = [];
let selectedStoryLayerId = null;
let storyHitAreas = {};
let draggingStoryElement = null;
let storyAnimationFrame = null;
let giphyLoaded = false;

const $ = (id) => document.getElementById(id);
const els = {
  title: $('title'), caption: $('caption'), hashtags: $('hashtags'), alt: $('alt-text'), addStory: $('add-story'), mode: $('mode'), schedule: $('schedule'),
  fb: $('dest-facebook'), ig: $('dest-instagram'), formatFeed: $('format-feed'), formatReel: $('format-reel'), mediaInput: $('media-input'), mediaGrid: $('media-grid'), mediaEmpty: $('media-empty')
};

function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function cleanTags(value) { return [...new Set(value.split(/[#,\n]+/).map(v => v.trim().replace(/^#+/, '')).filter(Boolean))]; }
function destinations() { return [els.fb.checked && 'Facebook', els.ig.checked && 'Instagram'].filter(Boolean); }
function postFormat() { return els.formatReel.checked ? 'reel' : 'feed'; }
const VIDEO_EXTENSIONS = new Set(['mp4','mov','m4v','webm','avi','mkv','mpeg','mpg','3gp','3g2','wmv']);
const IMAGE_EXTENSIONS = new Set(['jpg','jpeg','png','gif','webp','heic','heif','bmp','tif','tiff','avif']);
function mediaType(file) {
  if (/^(image|video)\//.test(file.type || '')) return file.type;
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return extension === 'mov' ? 'video/quicktime' : `video/${extension === 'm4v' ? 'mp4' : extension}`;
  if (IMAGE_EXTENSIONS.has(extension)) return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
  return '';
}
function syncStoryStudioButton() {
  const first = media[0];
  $('open-story-studio').disabled = !els.addStory.checked || !first;
  $('open-story-studio').title = first?.type?.startsWith('video/') ? 'Video Stories publish the original clip; photo Stories can use text and stickers.' : 'Add text and stickers to the photo Story.';
}
function resetStoryMedia() { storyMedia = null; storySourceId = null; syncStoryStudioButton(); }
function validate() {
  const errors = [];
  if (!els.caption.value.trim() && media.length === 0) errors.push('Add a caption or media.');
  if (!els.fb.checked && !els.ig.checked) errors.push('Choose at least one destination.');
  if (els.ig.checked && media.length === 0) errors.push('Instagram requires a photo or video.');
  if (postFormat() === 'reel' && (media.length !== 1 || !media[0]?.type?.startsWith('video/'))) errors.push('A Reel requires exactly one video.');
  if (els.addStory.checked && media.length === 0) errors.push('Adding to Story requires a photo or video.');
  if (els.mode.value === 'scheduled' && !els.schedule.value) errors.push('Choose a schedule time.');
  if (els.mode.value !== 'draft' && !settings.protectedToken) errors.push('Connect Meta before publishing.');
  if (els.mode.value !== 'draft' && !settings.selectedPageId) errors.push('Choose a publishing Page.');
  const box = $('validation');
  if (!errors.length) { box.textContent = postFormat() === 'reel' ? 'Ready to save as a Facebook and Instagram Reel.' : (els.ig.checked && media.length === 1 && media[0].type.startsWith('video/') ? 'Ready. Instagram will publish this single video as a Reel.' : 'Ready to save. Platform requirements are met.'); box.className = 'validation good'; }
  else { box.textContent = errors.join(' '); box.className = `validation ${errors.length > 1 ? 'bad' : ''}`; }
  return errors;
}

function fileToMedia(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const cached = await window.quDesktop.cacheMedia({ name: file.name, type: mediaType(file), dataUrl: reader.result });
        resolve({ id: uid(), ...cached });
      } catch (error) { reject(error); }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addFiles(files) {
  const chosen = [...files];
  const valid = chosen.filter(file => mediaType(file)).slice(0, 10 - media.length);
  const rejected = chosen.filter(file => !mediaType(file));
  if (rejected.length) $('save-state').textContent = `${rejected.length} unsupported file${rejected.length === 1 ? '' : 's'} skipped`;
  try {
    media.push(...await Promise.all(valid.map(fileToMedia)));
    resetStoryMedia(); renderMedia(); updatePreview(); validate();
  } catch (error) { $('save-state').textContent = `Could not add media: ${error.message}`; }
}

function mediaNode(item, controls = true) {
  const wrap = document.createElement('div'); wrap.className = 'media-thumb';
  const visual = document.createElement(item.type.startsWith('video/') ? 'video' : 'img');
  visual.src = item.previewUrl || item.dataUrl; visual.alt = item.name; if (visual.tagName === 'VIDEO') visual.muted = true;
  wrap.append(visual);
  if (controls) {
    if (item.type.startsWith('image/')) { const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.type = 'button'; edit.className = 'edit-media'; edit.addEventListener('click', e => { e.stopPropagation(); openImageEditor(item.id); }); wrap.append(edit); }
    const remove = document.createElement('button'); remove.textContent = '×'; remove.type = 'button'; remove.addEventListener('click', e => { e.stopPropagation(); media = media.filter(m => m.id !== item.id); resetStoryMedia(); renderMedia(); updatePreview(); validate(); }); wrap.append(remove);
  }
  return wrap;
}

function renderMedia() { els.mediaGrid.replaceChildren(...media.map(m => mediaNode(m))); els.mediaEmpty.hidden = media.length > 0; syncStoryStudioButton(); }

const FILTERS = {
  normal: 'none', clarendon: 'contrast(1.18) saturate(1.2)', gingham: 'brightness(1.08) sepia(.12) contrast(.92)',
  juno: 'saturate(1.35) contrast(1.08) brightness(1.04)', lark: 'brightness(1.08) saturate(.9) contrast(.95)',
  moon: 'grayscale(1) contrast(1.12) brightness(1.03)', reyes: 'sepia(.22) brightness(1.1) contrast(.88) saturate(.75)',
  valencia: 'sepia(.14) saturate(1.12) contrast(1.05) brightness(1.04)'
};
const RATIOS = { '1:1': [1080,1080], '4:5': [1080,1350], '1.91:1': [1080,566], '9:16': [1080,1920] };

function drawCrop() {
  if (!cropImage) return;
  const canvas=$('crop-canvas'), [w,h]=RATIOS[$('crop-ratio').value]; canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,w,h); ctx.fillStyle='#111'; ctx.fillRect(0,0,w,h); ctx.filter=FILTERS[cropFilter]||'none';
  const base=Math.max(w/cropImage.naturalWidth,h/cropImage.naturalHeight); const scale=base*Number($('crop-zoom').value||1);
  const dw=cropImage.naturalWidth*scale, dh=cropImage.naturalHeight*scale; const roomX=Math.max(0,(dw-w)/2), roomY=Math.max(0,(dh-h)/2);
  const dx=(w-dw)/2-Number($('crop-x').value||0)*roomX; const dy=(h-dh)/2-Number($('crop-y').value||0)*roomY;
  ctx.drawImage(cropImage,dx,dy,dw,dh); ctx.filter='none';
}

function openImageEditor(id) {
  const item=media.find(entry=>entry.id===id); if(!item||!item.type.startsWith('image/'))return;
  editingMediaId=id; cropFilter='normal'; $('crop-ratio').value=els.addStory.checked?'9:16':'1:1'; $('crop-zoom').value='1'; $('crop-x').value='0'; $('crop-y').value='0';
  document.querySelectorAll('[data-filter]').forEach(button=>button.classList.toggle('active',button.dataset.filter==='normal'));
  cropImage=new Image(); cropImage.onload=()=>{drawCrop(); $('image-editor-dialog').showModal(); window.quDesktop?.setAiSidebarObscured(true)}; cropImage.src=item.originalPreviewUrl||item.originalDataUrl||item.previewUrl||item.dataUrl;
}

['crop-ratio','crop-zoom','crop-x','crop-y'].forEach(id=>$(id).addEventListener('input',drawCrop));
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{cropFilter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('active',item===button));drawCrop()}));
$('reset-image-edit').addEventListener('click',()=>{cropFilter='normal';$('crop-zoom').value='1';$('crop-x').value='0';$('crop-y').value='0';document.querySelectorAll('[data-filter]').forEach(button=>button.classList.toggle('active',button.dataset.filter==='normal'));drawCrop()});
$('apply-image-edit').addEventListener('click',async()=>{const item=media.find(entry=>entry.id===editingMediaId);if(!item)return;const originalPreviewUrl=item.originalPreviewUrl||item.previewUrl;const originalDataUrl=item.originalDataUrl||item.dataUrl;const cached=await window.quDesktop.cacheMedia({name:item.name.replace(/\.[^.]+$/,'')+'-edited.jpg',type:'image/jpeg',dataUrl:$('crop-canvas').toDataURL('image/jpeg',.94)});Object.assign(item,cached,{originalPreviewUrl,originalDataUrl,edit:{ratio:$('crop-ratio').value,filter:cropFilter}});delete item.dataUrl;resetStoryMedia();$('image-editor-dialog').close();window.quDesktop?.setAiSidebarObscured(false);renderMedia();updatePreview();validate();$('save-state').textContent='Unsaved image edits'});
$('image-editor-dialog').addEventListener('close',()=>window.quDesktop?.setAiSidebarObscured(false));

function wrapCanvasText(ctx, text, maxWidth) {
  const words = text.trim().split(/\s+/).filter(Boolean), lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

function storyTextValue() {
  const value = $('story-text').value.trim();
  return $('story-text-uppercase').checked ? value.toUpperCase() : value;
}

function drawStoryText(ctx, w, h, showSelection) {
  const text = storyTextValue();
  if (!text) { delete storyHitAreas.text; return; }
  const size = Number($('story-text-size').value || 72), lineHeight = size * 1.18;
  const italic = $('story-text-italic').checked ? 'italic ' : '';
  ctx.font = `${italic}800 ${size}px ${$('story-font').value}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = wrapCanvasText(ctx, text, w - 180), blockHeight = Math.max(lineHeight, lines.length * lineHeight);
  const centerX = storyTextPoint.x * w, centerY = storyTextPoint.y * h, widest = Math.max(...lines.map(line => ctx.measureText(line).width), 0);
  const area = { x: centerX - widest / 2 - 50, y: centerY - blockHeight / 2 - 40, width: widest + 100, height: blockHeight + 80 };
  storyHitAreas.text = area;
  const effect = $('story-text-effect').value, colour = $('story-text-color').value;
  if (effect === 'highlight') { ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.beginPath(); ctx.roundRect(area.x, area.y, area.width, area.height, 34); ctx.fill(); }
  if (effect === 'shadow') { ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 12; }
  if (effect === 'neon') { ctx.shadowColor = colour; ctx.shadowBlur = 34; }
  if (effect === 'gradient') { const gradient = ctx.createLinearGradient(area.x, 0, area.x + area.width, 0); gradient.addColorStop(0, colour); gradient.addColorStop(.55, '#ec4899'); gradient.addColorStop(1, '#fb923c'); ctx.fillStyle = gradient; }
  else ctx.fillStyle = colour;
  if (effect === 'outline') { ctx.strokeStyle = '#050609'; ctx.lineWidth = Math.max(8, size * .16); ctx.lineJoin = 'round'; lines.forEach((line, index) => ctx.strokeText(line, centerX, centerY - ((lines.length - 1) * lineHeight) / 2 + index * lineHeight)); }
  lines.forEach((line, index) => ctx.fillText(line, centerX, centerY - ((lines.length - 1) * lineHeight) / 2 + index * lineHeight));
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  if (showSelection && selectedStoryLayerId === 'text') { ctx.strokeStyle = '#f0abfc'; ctx.lineWidth = 4; ctx.setLineDash([14,10]); ctx.strokeRect(area.x, area.y, area.width, area.height); ctx.setLineDash([]); }
}

function drawStorySticker(ctx, layer, w, h, showSelection) {
  const x = layer.x * w, y = layer.y * h, size = layer.size;
  const ratio = layer.kind === 'image' && layer.image?.naturalWidth && layer.image?.naturalHeight
    ? layer.image.naturalWidth / layer.image.naturalHeight : 1;
  const drawWidth = ratio >= 1 ? size : size * ratio, drawHeight = ratio >= 1 ? size / ratio : size;
  ctx.save(); ctx.translate(x, y); ctx.rotate((layer.rotation || 0) * Math.PI / 180); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (layer.kind === 'emoji') { ctx.font = `${size}px Arial, sans-serif`; ctx.fillText(layer.value, 0, 0); }
  else if (layer.image?.complete) ctx.drawImage(layer.image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
  const area = { x: x - drawWidth * .6, y: y - drawHeight * .6, width: drawWidth * 1.2, height: drawHeight * 1.2 };
  storyHitAreas[layer.id] = area;
  if (showSelection && selectedStoryLayerId === layer.id) { ctx.strokeStyle = '#f0abfc'; ctx.lineWidth = 4; ctx.setLineDash([14,10]); ctx.strokeRect(area.x, area.y, area.width, area.height); ctx.setLineDash([]); }
}

function drawStoryStudio(showSelection = true) {
  if (!storyImage) return;
  const canvas = $('story-canvas'), ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
  const scale = Math.max(w / storyImage.naturalWidth, h / storyImage.naturalHeight);
  const dw = storyImage.naturalWidth * scale, dh = storyImage.naturalHeight * scale;
  ctx.drawImage(storyImage, (w - dw) / 2, (h - dh) / 2, dw, dh);
  drawStoryText(ctx, w, h, showSelection);
  storyStickers.forEach(layer => drawStorySticker(ctx, layer, w, h, showSelection));
}

function updateStoryLayerUI() {
  const count = storyStickers.length + (storyTextValue() ? 1 : 0); $('story-layer-count').textContent = `${count} layer${count === 1 ? '' : 's'}`;
  const layer = storyStickers.find(item => item.id === selectedStoryLayerId);
  $('layer-empty').hidden = Boolean(layer); $('layer-controls').hidden = !layer;
  if (layer) { $('selected-layer-name').textContent = layer.name || 'Sticker'; $('story-layer-size').value = String(layer.size); $('story-layer-rotation').value = String(layer.rotation || 0); }
}

function selectStoryLayer(id) { selectedStoryLayerId = id; updateStoryLayerUI(); drawStoryStudio(); }

function animateStoryStudio() {
  cancelAnimationFrame(storyAnimationFrame); const tick = () => { if ($('story-studio-dialog').open) { drawStoryStudio(); storyAnimationFrame = requestAnimationFrame(tick); } }; tick();
}

function resetStoryControls() {
  $('story-text').value = ''; $('story-text-size').value = '72'; $('story-text-color').value = '#ffffff'; $('story-font').value = 'Arial, sans-serif'; $('story-text-effect').value = 'highlight'; $('story-text-uppercase').checked = false; $('story-text-italic').checked = false;
  storyTextPoint = { x: .5, y: .5 }; storyStickers = []; selectedStoryLayerId = null; storyHitAreas = {}; updateStoryLayerUI(); drawStoryStudio();
}

function openStoryStudio() {
  const first = media[0]; if (!els.addStory.checked || !first) return;
  if (first.type.startsWith('video/')) {
    $('story-studio-help').textContent = 'This video will publish to Story as-is. Meta does not offer its native interactive text or sticker tray through the publishing API; use a video editor first if you need burned-in overlays.';
    $('story-studio-dialog').showModal(); $('story-studio-dialog').classList.add('video-story-info'); $('story-canvas').hidden = true; $('story-studio-dialog').querySelector('aside').hidden = true; $('apply-story-style').hidden = true; window.quDesktop?.setAiSidebarObscured(true); return;
  }
  $('story-studio-dialog').classList.remove('video-story-info'); $('story-canvas').hidden = false; $('story-studio-dialog').querySelector('aside').hidden = false; $('apply-story-style').hidden = false;
  $('story-studio-help').textContent = 'Add as many layers as you want, then drag them directly on the Story.';
  storyImage = new Image(); storyImage.onload = () => { resetStoryControls(); $('story-studio-dialog').showModal(); animateStoryStudio(); window.quDesktop?.setAiSidebarObscured(true); }; storyImage.src = first.previewUrl || first.dataUrl;
}

$('open-story-studio').addEventListener('click', openStoryStudio);
['story-text','story-text-size','story-text-color','story-font','story-text-effect','story-text-uppercase','story-text-italic'].forEach(id => $(id).addEventListener('input', () => { if (storyTextValue()) selectedStoryLayerId = 'text'; updateStoryLayerUI(); drawStoryStudio(); }));
document.querySelectorAll('[data-story-panel]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-story-panel]').forEach(item => item.classList.toggle('active', item === button)); document.querySelectorAll('[data-story-tool]').forEach(panel => panel.classList.toggle('active', panel.dataset.storyTool === button.dataset.storyPanel)); if (button.dataset.storyPanel === 'giphy' && giphyKey() && !giphyLoaded) loadGiphy(''); }));
function addEmojiSticker(button) { const layer = { id: uid(), kind: 'emoji', value: button.dataset.sticker, name: button.dataset.name || 'Sticker', x: .5 + (Math.random() - .5) * .16, y: .72 + (Math.random() - .5) * .12, size: 150, rotation: 0 }; storyStickers.push(layer); selectStoryLayer(layer.id); }
document.querySelectorAll('[data-sticker]').forEach(button => button.addEventListener('click', () => addEmojiSticker(button)));
function filterStickerLibrary() { const query = $('sticker-search').value.trim().toLowerCase(), category = $('sticker-category').value; document.querySelectorAll('[data-sticker]').forEach(button => { const matchesText = !query || button.dataset.name.includes(query) || button.dataset.sticker.includes(query), matchesCategory = category === 'all' || button.dataset.category === category; button.hidden = !matchesText || !matchesCategory; }); }
$('sticker-search').addEventListener('input', filterStickerLibrary); $('sticker-category').addEventListener('change', filterStickerLibrary);
$('upload-story-sticker').addEventListener('click', () => $('story-sticker-upload').click());
$('story-sticker-upload').addEventListener('change', async () => { for (const file of [...$('story-sticker-upload').files]) { const type = mediaType(file); if (!['image/png','image/webp','image/gif'].includes(type)) continue; const cached = await fileToMedia(file); const image = new Image(); image.src = cached.previewUrl; const layer = { id: uid(), kind: 'image', name: file.name, x: .5, y: .72, size: 190, rotation: 0, image, animated: type === 'image/gif', ...cached }; storyStickers.push(layer); selectedStoryLayerId = layer.id; } $('story-sticker-upload').value = ''; updateStoryLayerUI(); drawStoryStudio(); });

$('giphy-api-key').value = settings.giphyApiKey || DEFAULT_GIPHY_API_KEY;
function giphyKey() { return settings.giphyApiKey || DEFAULT_GIPHY_API_KEY; }
function showGiphyMessage(message) { const empty = document.createElement('div'); empty.className = 'giphy-empty'; empty.textContent = message; $('giphy-results').replaceChildren(empty); }
function renderGiphyResults(results) {
  const nodes = results.map(result => { const button = document.createElement('button'); button.type = 'button'; button.className = 'giphy-result'; button.title = `Add ${result.title}`; const image = document.createElement('img'); image.src = result.previewUrl; image.alt = result.title; button.append(image); button.addEventListener('click', async () => { button.disabled = true; $('giphy-status').textContent = `Adding ${result.title}…`; try { const cached = await window.quDesktop.importGiphy(result); const layerImage = new Image(); layerImage.src = cached.previewUrl; const layer = { ...cached, id: uid(), kind: 'image', name: result.title, x: .5 + (Math.random() - .5) * .12, y: .7 + (Math.random() - .5) * .12, size: 210, rotation: 0, image: layerImage, animated: true }; storyStickers.push(layer); selectStoryLayer(layer.id); $('giphy-status').textContent = `${result.title} added. Drag it anywhere on the Story.`; } catch (error) { $('giphy-status').textContent = error.message; } finally { button.disabled = false; } }); return button; });
  if (nodes.length) $('giphy-results').replaceChildren(...nodes); else showGiphyMessage('No GIFs found. Try another search.');
}
async function loadGiphy(query) { const key = giphyKey(); if (!key) { showGiphyMessage('Add a GIPHY API key to load trending GIFs and search.'); return; } $('giphy-status').textContent = query ? `Searching GIPHY for “${query}”…` : 'Loading trending GIFs…'; showGiphyMessage('Loading…'); try { const results = await window.quDesktop.searchGiphy(key, query); renderGiphyResults(results); giphyLoaded = true; $('giphy-status').textContent = query ? `${results.length} results — click one to add it.` : 'Trending now — click one to add it.'; } catch (error) { showGiphyMessage('GIPHY could not load.'); $('giphy-status').textContent = error.message; } }
$('save-giphy-key').addEventListener('click', () => { const key = $('giphy-api-key').value.trim(); if (!key) { $('giphy-status').textContent = 'Paste your GIPHY API key first.'; return; } settings.giphyApiKey = key; write(SETTINGS_KEY, settings); giphyLoaded = false; loadGiphy(''); });
$('search-giphy').addEventListener('click', () => loadGiphy($('giphy-search').value.trim()));
$('giphy-search').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); loadGiphy($('giphy-search').value.trim()); } });
$('open-giphy-key').addEventListener('click', () => window.quDesktop.openExternal('https://developers.giphy.com/dashboard/'));
$('story-canvas').addEventListener('pointerdown', event => {
  const canvas = $('story-canvas'), rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) * canvas.width / rect.width, y = (event.clientY - rect.top) * canvas.height / rect.height;
  const contains = area => area && x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
  const sticker = [...storyStickers].reverse().find(layer => contains(storyHitAreas[layer.id])); draggingStoryElement = sticker?.id || (contains(storyHitAreas.text) ? 'text' : null);
  if (draggingStoryElement) { selectStoryLayer(draggingStoryElement); canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging'); }
});
$('story-canvas').addEventListener('pointermove', event => {
  if (!draggingStoryElement) return;
  const canvas = $('story-canvas'), rect = canvas.getBoundingClientRect();
  const point = { x: Math.min(.94, Math.max(.06, (event.clientX - rect.left) / rect.width)), y: Math.min(.94, Math.max(.06, (event.clientY - rect.top) / rect.height)) };
  if (draggingStoryElement === 'text') storyTextPoint = point; else { const layer = storyStickers.find(item => item.id === draggingStoryElement); if (layer) { layer.x = point.x; layer.y = point.y; } }
  drawStoryStudio();
});
function stopStoryDrag(event) { const canvas = $('story-canvas'); if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId); draggingStoryElement = null; canvas.classList.remove('dragging'); }
$('story-canvas').addEventListener('pointerup', stopStoryDrag); $('story-canvas').addEventListener('pointercancel', stopStoryDrag);
$('story-layer-size').addEventListener('input', () => { const layer = storyStickers.find(item => item.id === selectedStoryLayerId); if (layer) { layer.size = Number($('story-layer-size').value); drawStoryStudio(); } });
$('story-layer-rotation').addEventListener('input', () => { const layer = storyStickers.find(item => item.id === selectedStoryLayerId); if (layer) { layer.rotation = Number($('story-layer-rotation').value); drawStoryStudio(); } });
$('delete-story-layer').addEventListener('click', () => { storyStickers = storyStickers.filter(item => item.id !== selectedStoryLayerId); selectedStoryLayerId = null; updateStoryLayerUI(); drawStoryStudio(); });
$('duplicate-story-layer').addEventListener('click', () => { const layer = storyStickers.find(item => item.id === selectedStoryLayerId); if (!layer) return; const copy = { ...layer, id: uid(), x: Math.min(.92, layer.x + .08), y: Math.min(.92, layer.y + .06) }; storyStickers.push(copy); selectStoryLayer(copy.id); });
$('front-story-layer').addEventListener('click', () => { const index = storyStickers.findIndex(item => item.id === selectedStoryLayerId); if (index < 0) return; storyStickers.push(...storyStickers.splice(index, 1)); drawStoryStudio(); });
$('reset-story-style').addEventListener('click', resetStoryControls);
function blobToDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }
async function recordAnimatedStory() { const canvas = $('story-canvas'), stream = canvas.captureStream(30), chunks = [], recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' }); recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); }; recorder.start(); await new Promise(resolve => setTimeout(resolve, 5000)); const stopped = new Promise(resolve => recorder.addEventListener('stop', resolve, { once:true })); recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop()); return new Blob(chunks, { type:'video/webm' }); }
$('apply-story-style').addEventListener('click', async () => { const first = media[0]; if (!first || !first.type.startsWith('image/')) return; const button = $('apply-story-style'); button.disabled = true; try { selectedStoryLayerId = null; const animated = storyStickers.some(layer => layer.animated); let cached; if (animated) { button.textContent = 'Rendering GIF Story…'; const blob = await recordAnimatedStory(); const webm = await window.quDesktop.cacheMedia({ name:`${first.name.replace(/\.[^.]+$/,'')}-story.webm`, type:'video/webm', dataUrl:await blobToDataUrl(blob) }); cached = await window.quDesktop.transcodeStoryVideo(webm); } else { drawStoryStudio(false); cached = await window.quDesktop.cacheMedia({ name: `${first.name.replace(/\.[^.]+$/, '')}-story.jpg`, type: 'image/jpeg', dataUrl: $('story-canvas').toDataURL('image/jpeg', .94) }); } storyMedia = { id: uid(), ...cached }; storySourceId = first.id; $('story-studio-dialog').close(); $('save-state').textContent = animated ? 'Animated Story ready' : 'Styled Story ready'; updatePreview(); validate(); } catch (error) { $('story-studio-help').textContent = `Could not render Story: ${error.message}`; } finally { button.disabled = false; button.textContent = 'Use styled Story'; } });
$('story-studio-dialog').addEventListener('close', () => { cancelAnimationFrame(storyAnimationFrame); $('story-canvas').hidden = false; $('story-studio-dialog').querySelector('aside').hidden = false; $('apply-story-style').hidden = false; window.quDesktop?.setAiSidebarObscured(false); });

function updatePreview() {
  $('preview-caption').textContent = els.caption.value.trim() || 'Your caption will appear here.';
  $('preview-tags').textContent = cleanTags(els.hashtags.value).map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
  const area = $('preview-media'); area.replaceChildren();
  if (media[0]) { const visual = document.createElement(media[0].type.startsWith('video/') ? 'video' : 'img'); visual.src = media[0].previewUrl || media[0].dataUrl; visual.alt = els.alt.value || media[0].name; if (visual.tagName === 'VIDEO') { visual.controls = true; visual.muted = true; } area.append(visual); }
  else { const empty = document.createElement('span'); empty.textContent = previewPlatform === 'instagram' ? 'Add media for Instagram' : 'Optional media preview'; area.append(empty); }
  $('social-preview').className = `social-card ${previewPlatform} ${postFormat()}`;
}

function postFromEditor() {
  const existing = posts.find(post => post.id === editingId);
  return { id: editingId || uid(), title: els.title.value.trim() || 'Untitled post', caption: els.caption.value.trim(), hashtags: cleanTags(els.hashtags.value), alt: els.alt.value.trim(), media: [...media], storyMedia: storyMedia && storySourceId === media[0]?.id ? storyMedia : null, destinations: destinations(), format: postFormat(), addToStory: els.addStory.checked, mode: els.mode.value, schedule: els.schedule.value || '', status:existing?.status === 'published' ? 'ready' : (existing?.status || 'ready'), completedTasks:[...(existing?.completedTasks||[])], completedDestinations:[...(existing?.completedDestinations||[])], remote:{...(existing?.remote||{})}, updatedAt: new Date().toISOString() };
}

function clearEditor() {
  editingId = null; media = []; storyMedia = null; storySourceId = null; [els.title, els.caption, els.hashtags, els.alt, els.schedule].forEach(el => el.value = ''); els.addStory.checked = false; els.formatFeed.checked = true; els.mode.value = 'draft'; els.schedule.disabled = true; els.fb.checked = true; els.ig.checked = true; $('editor-heading').textContent = 'New post'; renderMedia(); updatePreview(); validate();
}

function savePost() {
  const errors = validate();
  if (els.mode.value !== 'draft' && errors.length) return;
  const post = postFromEditor();
  const i = posts.findIndex(p => p.id === post.id); if (i >= 0) posts[i] = post; else posts.unshift(post);
  write(STORAGE_KEY, posts); editingId = post.id; $('save-state').textContent = 'Saved just now'; renderAll();
}

function editPost(id) {
  const p = posts.find(post => post.id === id); if (!p) return;
  editingId = p.id; els.title.value = p.title; els.caption.value = p.caption; els.hashtags.value = p.hashtags.map(t => `#${t}`).join(' '); els.alt.value = p.alt || ''; media = p.media || []; storyMedia = p.storyMedia || null; storySourceId = storyMedia ? media[0]?.id : null; els.fb.checked = p.destinations.includes('Facebook'); els.ig.checked = p.destinations.includes('Instagram'); els.addStory.checked = Boolean(p.addToStory || p.format === 'story'); (p.format === 'reel' ? els.formatReel : els.formatFeed).checked = true; els.mode.value = p.mode; els.schedule.value = p.schedule || ''; els.schedule.disabled = p.mode !== 'scheduled'; $('editor-heading').textContent = p.title; renderMedia(); updatePreview(); validate(); window.scrollTo({top:0,behavior:'smooth'});
}

function removePost(id) { posts = posts.filter(p => p.id !== id); write(STORAGE_KEY, posts); if (editingId === id) clearEditor(); renderAll(); }

function renderPosts() {
  const list = $('post-list'); list.replaceChildren(); $('empty-list').hidden = posts.length > 0;
  posts.forEach(p => {
    const row = document.createElement('article'); row.className = 'post-item';
    const select=document.createElement('input');select.type='checkbox';select.className='post-select';select.dataset.select=p.id;select.setAttribute('aria-label',`Select ${p.title}`);
    const thumb = document.createElement('div'); thumb.className = 'post-thumb'; if (p.media?.[0]) thumb.append(mediaNode(p.media[0], false).firstChild); else thumb.textContent = 'Aa';
    const info = document.createElement('div'); const name = document.createElement('strong'); name.textContent = p.title; const detail = document.createElement('small'); const state=p.status==='published'?'Published':p.status==='failed'?`Failed · ${p.lastError||'Try again'}`:p.status==='publishing'?'Publishing…':p.mode === 'scheduled' ? new Date(p.schedule).toLocaleString() : p.mode; detail.textContent = `${p.destinations.join(' + ')} · ${p.format === 'reel' ? 'Reel' : 'Feed'}${p.addToStory?' + Story':''} · ${state}`; info.append(name, detail);
    const actions = document.createElement('div'); const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.addEventListener('click', () => editPost(p.id)); actions.append(edit); if(p.mode!=='draft'&&p.status!=='published'){const publish=document.createElement('button');publish.textContent=p.status==='failed'?'Retry':'Publish';publish.disabled=p.status==='publishing';publish.addEventListener('click',()=>publishPost(p.id));actions.append(publish)} const del = document.createElement('button'); del.textContent = '×'; del.title='Remove from Qu';del.addEventListener('click', () => removePost(p.id)); actions.append(del); row.append(select,thumb, info, actions); list.append(row);
  });
}

function renderStats() {
  const ready = posts.filter(p => p.mode!=='draft'&&p.status!=='published'&&(p.caption || p.media?.length) && p.destinations?.length && (!p.destinations.includes('Instagram') || p.media?.length));
  $('draft-count').textContent = posts.length; $('ready-count').textContent = ready.length; $('stat-drafts').textContent = posts.length; $('stat-ready').textContent = ready.length; $('stat-media').textContent = posts.reduce((n,p)=>n+(p.media?.length||0),0);
  const future = posts.filter(p => p.mode === 'scheduled' && new Date(p.schedule) > new Date()).sort((a,b)=>new Date(a.schedule)-new Date(b.schedule)); $('next-post').textContent = future[0] ? new Date(future[0].schedule).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : 'Nothing scheduled';
}

function calendarCells(root, date, detailed = false) {
  root.replaceChildren(); const year = date.getFullYear(), month = date.getMonth(); const first = new Date(year, month, 1); const start = new Date(year, month, 1 - first.getDay());
  for (let i=0;i<42;i++) { const day = new Date(start); day.setDate(start.getDate()+i); const cell = document.createElement(detailed?'div':'button'); const same = day.getMonth()===month; const today = day.toDateString()===new Date().toDateString(); cell.className = detailed ? `calendar-day ${same?'':'muted'} ${today?'today':''}` : `${same?'':'muted'} ${today?'today':''}`; const num = document.createElement(detailed?'b':'span'); num.textContent = day.getDate(); cell.append(num); if (detailed) posts.filter(p=>p.schedule && new Date(p.schedule).toDateString()===day.toDateString()).forEach(p=>{const tag=document.createElement('span');tag.className='calendar-post';tag.textContent=p.title;tag.addEventListener('click',()=>{showView('workspace');editPost(p.id)});cell.append(tag)}); else cell.addEventListener('click',()=>{const chosen=new Date(day);chosen.setHours(9,0,0,0);els.mode.value='scheduled';els.schedule.disabled=false;els.schedule.value=`${chosen.getFullYear()}-${String(chosen.getMonth()+1).padStart(2,'0')}-${String(chosen.getDate()).padStart(2,'0')}T09:00`;showView('workspace');validate();$('save-state').textContent='Posting day selected'}); root.append(cell); }
}

function renderCalendar() { const label=calendarDate.toLocaleDateString([],{month:'long',year:'numeric'}); $('month-title').textContent=label; $('calendar-title').textContent=label; calendarCells($('mini-days'),calendarDate); calendarCells($('calendar-grid'),calendarDate,true); }
function renderTemplates(){const list=$('template-list');list.replaceChildren();$('template-empty').hidden=templates.length>0;templates.forEach(t=>{const card=document.createElement('article');card.className='template-card';const name=document.createElement('strong');name.textContent=t.name;const detail=document.createElement('small');detail.textContent=`${t.destinations.join(' + ')} · ${t.hashtags.length} tags`;const actions=document.createElement('div');const use=document.createElement('button');use.textContent='Use template';use.addEventListener('click',()=>useTemplate(t.id));const del=document.createElement('button');del.textContent='Remove';del.className='danger';del.addEventListener('click',()=>{templates=templates.filter(x=>x.id!==t.id);write(TEMPLATES_KEY,templates);renderTemplates()});actions.append(use,del);card.append(name,detail,actions);list.append(card)})}
function useTemplate(id){const t=templates.find(x=>x.id===id);if(!t)return;clearEditor();els.title.value=t.title||'';els.caption.value=t.caption||'';els.hashtags.value=t.hashtags.map(x=>`#${x}`).join(' ');els.alt.value=t.alt||'';els.fb.checked=t.destinations.includes('Facebook');els.ig.checked=t.destinations.includes('Instagram');els.addStory.checked=Boolean(t.addToStory);(t.format==='reel'?els.formatReel:els.formatFeed).checked=true;els.mode.value=t.mode==='scheduled'?'draft':t.mode;showView('workspace');updatePreview();validate()}
function renderAll(){renderPosts();renderStats();renderCalendar();renderTemplates()}
function showView(view){$('workspace-view').hidden=view!=='workspace';$('calendar-view').hidden=view!=='calendar';$('templates-view').hidden=view!=='templates';document.querySelectorAll('.sidebar nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));}

document.querySelectorAll('input,textarea,select').forEach(el=>el.addEventListener('input',()=>{updatePreview();validate();$('save-state').textContent='Unsaved changes'}));
document.querySelectorAll('input[name="post-format"]').forEach(el=>el.addEventListener('change',()=>{updatePreview();validate();$('save-state').textContent='Unsaved changes'}));
els.addStory.addEventListener('change', syncStoryStudioButton);
els.mode.addEventListener('change',()=>{els.schedule.disabled=els.mode.value!=='scheduled';validate()});
$('media-zone').addEventListener('click',()=>els.mediaInput.click()); $('media-zone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')els.mediaInput.click()}); els.mediaInput.addEventListener('change',()=>addFiles(els.mediaInput.files));
['dragenter','dragover'].forEach(type=>$('media-zone').addEventListener(type,e=>{e.preventDefault();$('media-zone').classList.add('drag')})); ['dragleave','drop'].forEach(type=>$('media-zone').addEventListener(type,e=>{e.preventDefault();$('media-zone').classList.remove('drag')})); $('media-zone').addEventListener('drop',e=>addFiles(e.dataTransfer.files));
$('save-post').addEventListener('click',savePost); $('clear-editor').addEventListener('click',clearEditor); $('new-post').addEventListener('click',()=>{showView('workspace');clearEditor()}); $('delete-post').addEventListener('click',()=>editingId?removePost(editingId):clearEditor());
function selectedPostIds(){return[...document.querySelectorAll('[data-select]:checked')].map(input=>input.dataset.select)}
$('select-all').addEventListener('click',()=>{const boxes=[...document.querySelectorAll('[data-select]')];const shouldSelect=boxes.some(box=>!box.checked);boxes.forEach(box=>box.checked=shouldSelect);$('select-all').textContent=shouldSelect?'Select none':'Select all'});
$('remove-selected').addEventListener('click',()=>{const ids=selectedPostIds();if(!ids.length)return;$('remove-selected').textContent='Remove selected';if(confirm(`Remove ${ids.length} selected post${ids.length===1?'':'s'} from Qu?\n\nThis does not delete anything already published on Facebook or Instagram.`)){posts=posts.filter(post=>!ids.includes(post.id));write(STORAGE_KEY,posts);if(ids.includes(editingId))clearEditor();renderAll()}});
$('clear-published').addEventListener('click',()=>{const published=posts.filter(post=>post.status==='published');if(!published.length)return;if(confirm(`Remove ${published.length} published post${published.length===1?'':'s'} from Qu?\n\nThe live Facebook and Instagram posts will stay online.`)){const ids=new Set(published.map(post=>post.id));posts=posts.filter(post=>!ids.has(post.id));write(STORAGE_KEY,posts);if(ids.has(editingId))clearEditor();renderAll()}});
$('clear-all').addEventListener('click',()=>{if(posts.length&&confirm(`Clear all ${posts.length} posts from Qu?\n\nThis only clears the local workspace. Published Facebook and Instagram content will stay online.`)){posts=[];write(STORAGE_KEY,posts);clearEditor();renderAll()}});
$('load-demo').addEventListener('click',()=>{posts=[{id:uid(),title:'Studio update',caption:'A small look behind the scenes. More soon.',hashtags:['behindthescenes','creativework'],alt:'A bright creative workspace',media:[],destinations:['Facebook'],mode:'draft',schedule:'',updatedAt:new Date().toISOString()},{id:uid(),title:'Friday launch',caption:'Something new arrives Friday. Save the date ✦',hashtags:['launch','comingsoon'],alt:'',media:[],destinations:['Facebook'],mode:'scheduled',schedule:new Date(Date.now()+86400000).toISOString().slice(0,16),updatedAt:new Date().toISOString()}];write(STORAGE_KEY,posts);renderAll()});
document.querySelectorAll('[data-preview]').forEach(b=>b.addEventListener('click',()=>{previewPlatform=b.dataset.preview;document.querySelectorAll('[data-preview]').forEach(x=>x.classList.toggle('active',x===b));updatePreview()}));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
function shiftMonth(n){calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+n,1);renderCalendar()} $('month-prev').onclick=()=>shiftMonth(-1);$('month-next').onclick=()=>shiftMonth(1);$('calendar-back').onclick=()=>shiftMonth(-1);$('calendar-forward').onclick=()=>shiftMonth(1);$('calendar-today').onclick=()=>{calendarDate=new Date();renderCalendar()};
$('connect-meta').addEventListener('click',()=>{window.quDesktop?.setAiSidebarObscured(true);$('connect-dialog').showModal()});
$('open-meta-developers').addEventListener('click',()=>window.quDesktop?.openExternal('https://developers.facebook.com/apps/1061788106449322/settings/basic/'));
$('open-tester-guide').addEventListener('click',()=>{$('connect-dialog').close();renderTesterCheck(settings.pages||[],settings.metaAccess);$('tester-guide-dialog').showModal()});
$('open-app-roles').addEventListener('click',()=>window.quDesktop?.openExternal('https://developers.facebook.com/apps/1061788106449322/roles/roles/'));
$('open-meta-requests').addEventListener('click',()=>window.quDesktop?.openExternal('https://developers.facebook.com/requests/'));
$('open-business-settings').addEventListener('click',()=>window.quDesktop?.openExternal('https://business.facebook.com/settings/'));
$('tester-connect').addEventListener('click',()=>{$('tester-guide-dialog').close();$('connect-dialog').showModal();window.quDesktop?.setAiSidebarObscured(true);connectMeta()});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function renderTesterCheck(pages=[],access=null) {
  const box=$('tester-check'), icon=box.querySelector('span'), title=box.querySelector('strong'), detail=box.querySelector('small');
  box.classList.remove('good','bad');
  if(!settings.protectedToken||!pages.length){icon.textContent='1';title.textContent='Ready for the tester connection check';detail.textContent='After accepting the invitation, return here and connect the tester\'s Meta account.';return}
  if(!access){icon.textContent='↻';title.textContent='Reconnect once to verify tester access';detail.textContent='This account was connected before the new permission check was added.';return}
  const instagramCount=pages.filter(page=>page.instagram).length, missing=access?.missing||[];
  if(missing.length){box.classList.add('bad');icon.textContent='!';title.textContent='Connection works, but permissions are missing';detail.textContent=`Reconnect and approve: ${missing.join(', ')}`;return}
  box.classList.add('good');icon.textContent='✓';title.textContent='Tester access confirmed';detail.textContent=`All 6 publishing permissions granted · ${pages.length} Page${pages.length===1?'':'s'} · ${instagramCount} linked Instagram account${instagramCount===1?'':'s'}.`;
}
function populatePageSelector(pages) {
  const select=$('meta-page');select.replaceChildren();
  if(!pages.length){const option=document.createElement('option');option.value='';option.textContent='No managed Pages found';select.append(option);return}
  pages.forEach(page=>{const option=document.createElement('option');option.value=page.id;option.textContent=page.instagram?`${page.name} + @${page.instagram.username}`:page.name;select.append(option)});
  if(!pages.some(page=>page.id===settings.selectedPageId))settings.selectedPageId=pages[0].id;
  select.value=settings.selectedPageId;write(SETTINGS_KEY,settings);
}
function showConnectedDestinations(pages) {
  populatePageSelector(pages);const page=pages.find(item=>item.id===settings.selectedPageId)||pages[0];const instagram = page?.instagram;
  $('account-name').textContent = page?.name || 'Meta connected';
  $('account-detail').textContent = `${pages.length} Page${pages.length === 1 ? '' : 's'}${instagram ? ' + Instagram' : ''}`;
  $('facebook-target').textContent = page?.name || 'No managed Page found';
  $('instagram-target').textContent = instagram ? `@${instagram.username}` : 'No linked professional account';
  $('preview-name').textContent = instagram ? `@${instagram.username}` : (pages[0]?.name || 'Your account');
}
async function connectMeta(){
  const appId=$('meta-app-id').value.trim(), service=$('oauth-service').value.trim().replace(/\/$/,'');
  if(!appId||!/^https:\/\//.test(service)){$('connection-status').textContent='Add a Meta App ID and a secure OAuth service address first.';return}
  settings={...settings,appId,service};write(SETTINGS_KEY,settings);
  $('start-meta-connect').disabled=true;$('connection-status').textContent='Opening secure Meta authorization…';
  try{
    const session=await window.quDesktop.startMetaAuth(service);
    $('connection-status').textContent='Waiting for Meta approval in your browser…';
    const deadline=Date.now()+Math.min((session.expiresIn||900)*1000,15*60*1000);
    let result;
    while(Date.now()<deadline){await wait(1800);result=await window.quDesktop.pollMetaAuth(service,session.sessionId,session.sessionKey);if(result.status!=='pending')break}
    if(!result||result.status!=='complete')throw new Error(result?.message||'Authorization timed out. Please try again.');
    const [pages,metaAccess]=await Promise.all([window.quDesktop.getMetaDestinations(result.accessToken),window.quDesktop.checkMetaAccess(result.accessToken)]);
    const protectedToken=await window.quDesktop.protectToken(result.accessToken);
    settings={...settings,protectedToken,pages,metaAccess,connectedAt:new Date().toISOString()};write(SETTINGS_KEY,settings);
    showConnectedDestinations(pages);renderTesterCheck(pages,metaAccess);$('connection-status').textContent=metaAccess.missing.length?`Connected, but ${metaAccess.missing.length} required permission${metaAccess.missing.length===1?' is':'s are'} missing. Open Tester setup for details.`:`Connected successfully. All required permissions granted; loaded ${pages.length} Facebook Page${pages.length===1?'':'s'}.`;
  }catch(e){$('connection-status').textContent=`Unable to connect: ${e.message}`}
  finally{$('start-meta-connect').disabled=false}
}
$('start-meta-connect').addEventListener('click',connectMeta);
$('meta-app-id').value=settings.appId||'1061788106449322';$('oauth-service').value=settings.service||'https://qu-meta-auth.nullgurl.workers.dev';
if(settings.pages?.length){showConnectedDestinations(settings.pages);renderTesterCheck(settings.pages,settings.metaAccess)}
$('meta-page').addEventListener('change',()=>{settings={...settings,selectedPageId:$('meta-page').value};write(SETTINGS_KEY,settings);showConnectedDestinations(settings.pages||[]);validate()});
$('disconnect-meta').addEventListener('click',()=>{settings={appId:settings.appId,service:settings.service,giphyApiKey:settings.giphyApiKey};write(SETTINGS_KEY,settings);$('account-name').textContent='Connect Meta';$('account-detail').textContent='Pages + Instagram';$('facebook-target').textContent='Choose after connecting';$('instagram-target').textContent='Professional account required';populatePageSelector([]);renderTesterCheck();$('connection-status').textContent='Disconnected. Local drafts were kept.';validate()});
$('save-template').addEventListener('click',()=>{window.quDesktop?.setAiSidebarObscured(true);$('template-name').value=els.title.value.trim();$('template-dialog').showModal()});
$('confirm-template').addEventListener('click',()=>{const name=$('template-name').value.trim()||'Untitled template';const p=postFromEditor();templates.unshift({id:uid(),name,title:p.title,caption:p.caption,hashtags:p.hashtags,alt:p.alt,destinations:p.destinations,format:p.format,addToStory:p.addToStory,mode:p.mode});write(TEMPLATES_KEY,templates);renderTemplates();$('template-dialog').close();showView('templates')});
$('template-new-post').addEventListener('click',()=>{clearEditor();showView('workspace')});
function dueToPublish(post){return post.mode==='now'||(post.mode==='scheduled'&&post.schedule&&new Date(post.schedule)<=new Date())}
async function publishPost(id){
  const index=posts.findIndex(post=>post.id===id);if(index<0)return;const post=posts[index];
  if(!settings.protectedToken||!settings.selectedPageId){$('connect-dialog').showModal();$('connection-status').textContent='Connect Meta and choose a Page before publishing.';return}
  const page=(settings.pages||[]).find(item=>item.id===settings.selectedPageId);if(!page){$('connect-dialog').showModal();$('connection-status').textContent='Choose a valid publishing Page.';return}
  if(post.destinations.includes('Instagram')&&!post.media?.length){post.status='failed';post.lastError='Instagram requires media.';write(STORAGE_KEY,posts);renderAll();return}
  const primaryTask=post.format==='reel'?'Reel':'Feed';const allTasks=post.destinations.flatMap(destination=>[`${destination}${primaryTask}`,...(post.addToStory?[`${destination}Story`]:[])]);const complete=new Set(post.completedTasks||[]);(post.completedDestinations||[]).forEach(destination=>complete.add(`${destination}${primaryTask}`));const remaining=allTasks.filter(task=>!complete.has(task));if(!remaining.length){post.status='published';write(STORAGE_KEY,posts);renderAll();return}
  post.status='publishing';delete post.lastError;write(STORAGE_KEY,posts);renderAll();$('publish-status').textContent=`Publishing ${post.title}…`;
  try{const result=await window.quDesktop.publishMetaPost({post:{...post,tasks:remaining},page,protectedToken:settings.protectedToken,service:settings.service});const successes=Object.keys(result.successes||{});post.completedTasks=[...new Set([...(post.completedTasks||[]),...successes])];post.remote={...(post.remote||{}),...(result.successes||{})};const failures=Object.entries(result.errors||{});if(failures.length){post.status='failed';post.lastError=failures.map(([task,message])=>`${task.replace(/(Feed|Story)$/,' $1')}: ${message}`).join(' · ');$('publish-status').textContent=`Partly published: ${post.lastError}`}else if(allTasks.every(task=>post.completedTasks.includes(task))){post.status='published';post.publishedAt=new Date().toISOString();$('publish-status').textContent=`Published ${post.title}`}else{post.status='failed';post.lastError='Some publishing tasks did not return a result.'}}
  catch(error){post.status='failed';post.lastError=error.message;$('publish-status').textContent=`Failed: ${error.message}`}
  write(STORAGE_KEY,posts);renderAll();
}
$('publish-ready').addEventListener('click',async()=>{if(!settings.protectedToken){$('connect-dialog').showModal();$('connection-status').textContent='Connect Meta before publishing.';return}const ready=posts.filter(post=>post.status!=='published'&&post.status!=='publishing'&&dueToPublish(post));if(!ready.length){$('publish-status').textContent='Nothing is due to publish.';return}for(const post of ready)await publishPost(post.id)});
setInterval(()=>{posts.filter(post=>post.status!=='published'&&post.status!=='publishing'&&dueToPublish(post)).forEach(post=>publishPost(post.id))},30000);

const AI_NAMES={chatgpt:'ChatGPT',claude:'Claude',gemini:'Gemini',deepseek:'DeepSeek',copilot:'Copilot'};
let aiSidebar={open:true,provider:'chatgpt'};
function syncAiBounds(){const shell=$('ai-sidebar-shell');if(!shell)return;const rect=shell.getBoundingClientRect();window.quDesktop?.setAiSidebarBounds({x:rect.x,y:rect.y,width:rect.width,height:rect.height})}
function renderAi(){ $('ai-provider-title').textContent=AI_NAMES[aiSidebar.provider]||'AI assistant';document.querySelectorAll('[data-ai-provider]').forEach(button=>button.classList.toggle('active',button.dataset.aiProvider===aiSidebar.provider));requestAnimationFrame(syncAiBounds) }
document.querySelectorAll('[data-ai-provider]').forEach(button=>button.addEventListener('click',async()=>{aiSidebar=await window.quDesktop.selectAiProvider(button.dataset.aiProvider)||aiSidebar;renderAi()}));
$('ai-reload').addEventListener('click',()=>window.quDesktop.reloadAiSidebar());$('ai-open-external').addEventListener('click',()=>window.quDesktop.openAiProviderExternal());
window.addEventListener('resize',syncAiBounds);document.addEventListener('scroll',syncAiBounds,true);
document.querySelectorAll('dialog').forEach(dialog=>{dialog.addEventListener('close',()=>window.quDesktop?.setAiSidebarObscured(false))});
(async()=>{aiSidebar=await window.quDesktop.aiSidebarState()||aiSidebar;await window.quDesktop.setAiSidebarOpen(true);renderAi()})();
clearEditor();renderAll();
