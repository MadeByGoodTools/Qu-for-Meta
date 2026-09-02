const STORAGE_KEY = 'qu-meta-posts-v1';
const SETTINGS_KEY = 'qu-meta-settings-v1';
const TEMPLATES_KEY = 'qu-meta-templates-v1';
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

const $ = (id) => document.getElementById(id);
const els = {
  title: $('title'), caption: $('caption'), hashtags: $('hashtags'), alt: $('alt-text'), addStory: $('add-story'), mode: $('mode'), schedule: $('schedule'),
  fb: $('dest-facebook'), ig: $('dest-instagram'), mediaInput: $('media-input'), mediaGrid: $('media-grid'), mediaEmpty: $('media-empty')
};

function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function cleanTags(value) { return [...new Set(value.split(/[#,\n]+/).map(v => v.trim().replace(/^#+/, '')).filter(Boolean))]; }
function destinations() { return [els.fb.checked && 'Facebook', els.ig.checked && 'Instagram'].filter(Boolean); }
function validate() {
  const errors = [];
  if (!els.caption.value.trim() && media.length === 0) errors.push('Add a caption or media.');
  if (!els.fb.checked && !els.ig.checked) errors.push('Choose at least one destination.');
  if (els.ig.checked && media.length === 0) errors.push('Instagram requires a photo or video.');
  if (els.addStory.checked && media.length === 0) errors.push('Adding to Story requires an image.');
  if (els.addStory.checked && media[0] && !media[0].type.startsWith('image/')) errors.push('This release adds photo Stories. Make the first media item an image.');
  if (els.mode.value === 'scheduled' && !els.schedule.value) errors.push('Choose a schedule time.');
  if (els.mode.value !== 'draft' && !settings.protectedToken) errors.push('Connect Meta before publishing.');
  if (els.mode.value !== 'draft' && !settings.selectedPageId) errors.push('Choose a publishing Page.');
  const box = $('validation');
  if (!errors.length) { box.textContent = 'Ready to save. Platform requirements are met.'; box.className = 'validation good'; }
  else { box.textContent = errors.join(' '); box.className = `validation ${errors.length > 1 ? 'bad' : ''}`; }
  return errors;
}

function fileToMedia(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: uid(), name: file.name, type: file.type, dataUrl: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addFiles(files) {
  const valid = [...files].filter(f => /^(image|video)\//.test(f.type)).slice(0, 10 - media.length);
  media.push(...await Promise.all(valid.map(fileToMedia)));
  renderMedia(); updatePreview(); validate();
}

function mediaNode(item, controls = true) {
  const wrap = document.createElement('div'); wrap.className = 'media-thumb';
  const visual = document.createElement(item.type.startsWith('video/') ? 'video' : 'img');
  visual.src = item.dataUrl; visual.alt = item.name; if (visual.tagName === 'VIDEO') visual.muted = true;
  wrap.append(visual);
  if (controls) {
    if (item.type.startsWith('image/')) { const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.type = 'button'; edit.className = 'edit-media'; edit.addEventListener('click', e => { e.stopPropagation(); openImageEditor(item.id); }); wrap.append(edit); }
    const remove = document.createElement('button'); remove.textContent = '×'; remove.type = 'button'; remove.addEventListener('click', e => { e.stopPropagation(); media = media.filter(m => m.id !== item.id); renderMedia(); updatePreview(); validate(); }); wrap.append(remove);
  }
  return wrap;
}

function renderMedia() { els.mediaGrid.replaceChildren(...media.map(m => mediaNode(m))); els.mediaEmpty.hidden = media.length > 0; }

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
  cropImage=new Image(); cropImage.onload=()=>{drawCrop(); $('image-editor-dialog').showModal(); window.quDesktop?.setAiSidebarObscured(true)}; cropImage.src=item.originalDataUrl||item.dataUrl;
}

['crop-ratio','crop-zoom','crop-x','crop-y'].forEach(id=>$(id).addEventListener('input',drawCrop));
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{cropFilter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('active',item===button));drawCrop()}));
$('reset-image-edit').addEventListener('click',()=>{cropFilter='normal';$('crop-zoom').value='1';$('crop-x').value='0';$('crop-y').value='0';document.querySelectorAll('[data-filter]').forEach(button=>button.classList.toggle('active',button.dataset.filter==='normal'));drawCrop()});
$('apply-image-edit').addEventListener('click',()=>{const item=media.find(entry=>entry.id===editingMediaId);if(!item)return;item.originalDataUrl=item.originalDataUrl||item.dataUrl;item.dataUrl=$('crop-canvas').toDataURL('image/jpeg',.94);item.type='image/jpeg';item.name=item.name.replace(/\.[^.]+$/,'')+'-edited.jpg';item.edit={ratio:$('crop-ratio').value,filter:cropFilter};$('image-editor-dialog').close();window.quDesktop?.setAiSidebarObscured(false);renderMedia();updatePreview();validate();$('save-state').textContent='Unsaved image edits'});
$('image-editor-dialog').addEventListener('close',()=>window.quDesktop?.setAiSidebarObscured(false));

function updatePreview() {
  $('preview-caption').textContent = els.caption.value.trim() || 'Your caption will appear here.';
  $('preview-tags').textContent = cleanTags(els.hashtags.value).map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
  const area = $('preview-media'); area.replaceChildren();
  if (media[0]) { const visual = document.createElement(media[0].type.startsWith('video/') ? 'video' : 'img'); visual.src = media[0].dataUrl; visual.alt = els.alt.value || media[0].name; if (visual.tagName === 'VIDEO') { visual.controls = true; visual.muted = true; } area.append(visual); }
  else { const empty = document.createElement('span'); empty.textContent = previewPlatform === 'instagram' ? 'Add media for Instagram' : 'Optional media preview'; area.append(empty); }
  $('social-preview').className = `social-card ${previewPlatform}`;
}

function postFromEditor() {
  const existing = posts.find(post => post.id === editingId);
  return { id: editingId || uid(), title: els.title.value.trim() || 'Untitled post', caption: els.caption.value.trim(), hashtags: cleanTags(els.hashtags.value), alt: els.alt.value.trim(), media: [...media], destinations: destinations(), format: 'feed', addToStory: els.addStory.checked, mode: els.mode.value, schedule: els.schedule.value || '', status:existing?.status === 'published' ? 'ready' : (existing?.status || 'ready'), completedTasks:[...(existing?.completedTasks||[])], completedDestinations:[...(existing?.completedDestinations||[])], remote:{...(existing?.remote||{})}, updatedAt: new Date().toISOString() };
}

function clearEditor() {
  editingId = null; media = []; [els.title, els.caption, els.hashtags, els.alt, els.schedule].forEach(el => el.value = ''); els.addStory.checked = false; els.mode.value = 'draft'; els.schedule.disabled = true; els.fb.checked = true; els.ig.checked = true; $('editor-heading').textContent = 'New post'; renderMedia(); updatePreview(); validate();
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
  editingId = p.id; els.title.value = p.title; els.caption.value = p.caption; els.hashtags.value = p.hashtags.map(t => `#${t}`).join(' '); els.alt.value = p.alt || ''; media = p.media || []; els.fb.checked = p.destinations.includes('Facebook'); els.ig.checked = p.destinations.includes('Instagram'); els.addStory.checked = Boolean(p.addToStory || p.format === 'story'); els.mode.value = p.mode; els.schedule.value = p.schedule || ''; els.schedule.disabled = p.mode !== 'scheduled'; $('editor-heading').textContent = p.title; renderMedia(); updatePreview(); validate(); window.scrollTo({top:0,behavior:'smooth'});
}

function removePost(id) { posts = posts.filter(p => p.id !== id); write(STORAGE_KEY, posts); if (editingId === id) clearEditor(); renderAll(); }

function renderPosts() {
  const list = $('post-list'); list.replaceChildren(); $('empty-list').hidden = posts.length > 0;
  posts.forEach(p => {
    const row = document.createElement('article'); row.className = 'post-item';
    const select=document.createElement('input');select.type='checkbox';select.className='post-select';select.dataset.select=p.id;select.setAttribute('aria-label',`Select ${p.title}`);
    const thumb = document.createElement('div'); thumb.className = 'post-thumb'; if (p.media?.[0]) thumb.append(mediaNode(p.media[0], false).firstChild); else thumb.textContent = 'Aa';
    const info = document.createElement('div'); const name = document.createElement('strong'); name.textContent = p.title; const detail = document.createElement('small'); const state=p.status==='published'?'Published':p.status==='failed'?`Failed · ${p.lastError||'Try again'}`:p.status==='publishing'?'Publishing…':p.mode === 'scheduled' ? new Date(p.schedule).toLocaleString() : p.mode; detail.textContent = `${p.destinations.join(' + ')} · Feed${p.addToStory?' + Story':''} · ${state}`; info.append(name, detail);
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
function useTemplate(id){const t=templates.find(x=>x.id===id);if(!t)return;clearEditor();els.title.value=t.title||'';els.caption.value=t.caption||'';els.hashtags.value=t.hashtags.map(x=>`#${x}`).join(' ');els.alt.value=t.alt||'';els.fb.checked=t.destinations.includes('Facebook');els.ig.checked=t.destinations.includes('Instagram');els.addStory.checked=Boolean(t.addToStory);els.mode.value=t.mode==='scheduled'?'draft':t.mode;showView('workspace');updatePreview();validate()}
function renderAll(){renderPosts();renderStats();renderCalendar();renderTemplates()}
function showView(view){$('workspace-view').hidden=view!=='workspace';$('calendar-view').hidden=view!=='calendar';$('templates-view').hidden=view!=='templates';document.querySelectorAll('.sidebar nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));}

document.querySelectorAll('input,textarea,select').forEach(el=>el.addEventListener('input',()=>{updatePreview();validate();$('save-state').textContent='Unsaved changes'}));
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
$('connect-meta').addEventListener('click',()=>{window.quDesktop?.setAiSidebarObscured(true);$('connect-dialog').showModal()}); $('open-meta-developers').addEventListener('click',()=>window.quDesktop?.openExternal('https://developers.facebook.com/apps/'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
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
$('start-meta-connect').addEventListener('click',async()=>{
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
    const pages=await window.quDesktop.getMetaDestinations(result.accessToken);
    const protectedToken=await window.quDesktop.protectToken(result.accessToken);
    settings={...settings,protectedToken,pages,connectedAt:new Date().toISOString()};write(SETTINGS_KEY,settings);
    showConnectedDestinations(pages);$('connection-status').textContent=`Connected successfully. Loaded ${pages.length} Facebook Page${pages.length===1?'':'s'}.`;
  }catch(e){$('connection-status').textContent=`Unable to connect: ${e.message}`}
  finally{$('start-meta-connect').disabled=false}
});
$('meta-app-id').value=settings.appId||'1061788106449322';$('oauth-service').value=settings.service||'https://qu-meta-auth.nullgurl.workers.dev';
if(settings.pages?.length)showConnectedDestinations(settings.pages);
$('meta-page').addEventListener('change',()=>{settings={...settings,selectedPageId:$('meta-page').value};write(SETTINGS_KEY,settings);showConnectedDestinations(settings.pages||[]);validate()});
$('disconnect-meta').addEventListener('click',()=>{settings={appId:settings.appId,service:settings.service};write(SETTINGS_KEY,settings);$('account-name').textContent='Connect Meta';$('account-detail').textContent='Pages + Instagram';$('facebook-target').textContent='Choose after connecting';$('instagram-target').textContent='Professional account required';populatePageSelector([]);$('connection-status').textContent='Disconnected. Local drafts were kept.';validate()});
$('save-template').addEventListener('click',()=>{window.quDesktop?.setAiSidebarObscured(true);$('template-name').value=els.title.value.trim();$('template-dialog').showModal()});
$('confirm-template').addEventListener('click',()=>{const name=$('template-name').value.trim()||'Untitled template';const p=postFromEditor();templates.unshift({id:uid(),name,title:p.title,caption:p.caption,hashtags:p.hashtags,alt:p.alt,destinations:p.destinations,addToStory:p.addToStory,mode:p.mode});write(TEMPLATES_KEY,templates);renderTemplates();$('template-dialog').close();showView('templates')});
$('template-new-post').addEventListener('click',()=>{clearEditor();showView('workspace')});
function dueToPublish(post){return post.mode==='now'||(post.mode==='scheduled'&&post.schedule&&new Date(post.schedule)<=new Date())}
async function publishPost(id){
  const index=posts.findIndex(post=>post.id===id);if(index<0)return;const post=posts[index];
  if(!settings.protectedToken||!settings.selectedPageId){$('connect-dialog').showModal();$('connection-status').textContent='Connect Meta and choose a Page before publishing.';return}
  const page=(settings.pages||[]).find(item=>item.id===settings.selectedPageId);if(!page){$('connect-dialog').showModal();$('connection-status').textContent='Choose a valid publishing Page.';return}
  if(post.destinations.includes('Instagram')&&!post.media?.length){post.status='failed';post.lastError='Instagram requires media.';write(STORAGE_KEY,posts);renderAll();return}
  const allTasks=post.destinations.flatMap(destination=>[`${destination}Feed`,...(post.addToStory?[`${destination}Story`]:[])]);const complete=new Set(post.completedTasks||[]);(post.completedDestinations||[]).forEach(destination=>complete.add(`${destination}Feed`));const remaining=allTasks.filter(task=>!complete.has(task));if(!remaining.length){post.status='published';write(STORAGE_KEY,posts);renderAll();return}
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
