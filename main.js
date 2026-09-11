const { app, BrowserWindow, WebContentsView, ipcMain, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

let mainWindow;
const aiSidebars = new Map();
const AI_PARTITION = 'persist:qu-meta-ai';
const AI_PROVIDERS = Object.freeze({ chatgpt:'https://chatgpt.com/',claude:'https://claude.ai/new',gemini:'https://gemini.google.com/app',deepseek:'https://chat.deepseek.com/',copilot:'https://copilot.microsoft.com/' });

function aiStateFor(sender){const win=BrowserWindow.fromWebContents(sender);return win?aiSidebars.get(win.id):null}
function updateAiBounds(win){const state=aiSidebars.get(win.id);if(!state?.view||!state.open||state.obscured||!state.bounds)return;const [cw,ch]=win.getContentSize();const {x,y,width,height}=state.bounds;state.view.setBounds({x:Math.max(0,Math.round(x)),y:Math.max(0,Math.round(y+120)),width:Math.max(1,Math.min(cw-Math.round(x),Math.round(width))),height:Math.max(1,Math.min(ch-Math.round(y+120),Math.round(height-120)))})}
function createAiView(win,state){if(state.view&&!state.view.webContents.isDestroyed())return state.view;const view=new WebContentsView({webPreferences:{partition:AI_PARTITION,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});view.setBackgroundColor('#0b0d12');view.webContents.on('will-navigate',(event,url)=>{try{if(new URL(url).protocol!=='https:')event.preventDefault()}catch{event.preventDefault()}});view.webContents.setWindowOpenHandler(({url})=>{try{if(new URL(url).protocol==='https:')shell.openExternal(url)}catch{}return{action:'deny'}});state.view=view;return view}
function openAi(win,state){const view=createAiView(win,state);if(!win.contentView.children.includes(view))win.contentView.addChildView(view);state.open=true;updateAiBounds(win);if(state.loadedProvider!==state.provider){state.loadedProvider=state.provider;view.webContents.loadURL(AI_PROVIDERS[state.provider])}}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#0b0d12',
    title: 'Qu for Meta',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('index.html');
  aiSidebars.set(mainWindow.id,{open:true,obscured:false,provider:'chatgpt',bounds:null,view:null,loadedProvider:null});
  mainWindow.on('closed',()=>aiSidebars.delete(mainWindow.id));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('open-external', (_event, url) => {
  if (!/^https:\/\//i.test(url)) throw new Error('Only secure web addresses are allowed.');
  return shell.openExternal(url);
});

ipcMain.handle('ai-sidebar-state',event=>{const state=aiStateFor(event.sender);return state?{open:state.open,provider:state.provider}:null});
ipcMain.handle('ai-sidebar-open',(event,value)=>{const win=BrowserWindow.fromWebContents(event.sender),state=win&&aiSidebars.get(win.id);if(!win||!state)return null;state.open=Boolean(value);if(state.open&&!state.obscured)openAi(win,state);else if(state.view&&win.contentView.children.includes(state.view))win.contentView.removeChildView(state.view);return{open:state.open,provider:state.provider}});
ipcMain.handle('ai-sidebar-provider',(event,provider)=>{const win=BrowserWindow.fromWebContents(event.sender),state=win&&aiSidebars.get(win.id);if(!win||!state||!AI_PROVIDERS[provider])return null;state.provider=provider;state.open=true;if(!state.obscured)openAi(win,state);return{open:true,provider}});
ipcMain.handle('ai-sidebar-bounds',(event,bounds)=>{const win=BrowserWindow.fromWebContents(event.sender),state=win&&aiSidebars.get(win.id);if(!win||!state||!bounds)return false;state.bounds={x:Number(bounds.x)||0,y:Number(bounds.y)||0,width:Math.max(320,Number(bounds.width)||0),height:Math.max(320,Number(bounds.height)||0)};updateAiBounds(win);return true});
ipcMain.handle('ai-sidebar-obscured',(event,value)=>{const win=BrowserWindow.fromWebContents(event.sender),state=win&&aiSidebars.get(win.id);if(!win||!state)return false;state.obscured=Boolean(value);if(state.obscured&&state.view&&win.contentView.children.includes(state.view))win.contentView.removeChildView(state.view);else if(!state.obscured&&state.open)openAi(win,state);return state.obscured});
ipcMain.handle('ai-sidebar-reload',event=>{const state=aiStateFor(event.sender);state?.view?.webContents.reload()});
ipcMain.handle('ai-sidebar-open-external',event=>{const state=aiStateFor(event.sender);if(state)shell.openExternal(AI_PROVIDERS[state.provider])});

function secureServiceUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('The OAuth service must use HTTPS.');
  return url;
}

ipcMain.handle('start-meta-auth', async (_event, service) => {
  const base = secureServiceUrl(service);
  const response = await fetch(new URL('/v1/oauth/start', base), {
    method: 'POST',
    headers: { accept: 'application/json' }
  });
  const result = await response.json();
  if (!response.ok || !result.authorizeUrl) throw new Error(result.error || `Authorization could not start (${response.status}).`);
  await shell.openExternal(result.authorizeUrl);
  return result;
});

ipcMain.handle('poll-meta-auth', async (_event, service, sessionId, sessionKey) => {
  const base = secureServiceUrl(service);
  const response = await fetch(new URL(`/v1/oauth/session/${encodeURIComponent(sessionId)}`, base), {
    headers: { accept: 'application/json', 'x-qu-session-key': sessionKey }
  });
  const result = await response.json();
  if (!response.ok && response.status !== 202) throw new Error(result.message || result.error || `Authorization check failed (${response.status}).`);
  return result;
});

ipcMain.handle('get-meta-destinations', async (_event, accessToken) => {
  if (!accessToken) throw new Error('Meta access token is missing.');
  const url = new URL('https://graph.facebook.com/v23.0/me/accounts');
  url.searchParams.set('fields', 'id,name,instagram_business_account{id,username}');
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || `Meta accounts could not be loaded (${response.status}).`);
  return (result.data || []).map(page => ({
    id: page.id,
    name: page.name,
    instagram: page.instagram_business_account || null
  }));
});

async function graph(pathname, accessToken, options = {}) {
  const url = new URL(`https://graph.facebook.com/v23.0/${pathname.replace(/^\//, '')}`);
  const method = options.method || 'GET';
  let body;
  if (options.form) {
    body = options.form;
  } else {
    const params = new URLSearchParams(options.params || {});
    if (method === 'GET') for (const [key, value] of params) url.searchParams.set(key, value);
    else body = params;
  }
  if (method === 'GET') url.searchParams.set('access_token', accessToken);
  else if (body instanceof URLSearchParams) body.set('access_token', accessToken);
  else if (body instanceof FormData) body.set('access_token', accessToken);
  const response = await fetch(url, { method, body, headers: { accept: 'application/json' } });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error?.message || `Meta request failed (${response.status}).`);
  return result;
}

ipcMain.handle('check-meta-access', async (_event, accessToken) => {
  if (!accessToken) throw new Error('Meta access token is missing.');
  const required = ['pages_show_list','pages_read_engagement','pages_manage_posts','business_management','instagram_basic','instagram_content_publish'];
  const result = await graph('me/permissions', accessToken);
  const granted = new Set((result.data || []).filter(item => item.status === 'granted').map(item => item.permission));
  return { granted: required.filter(permission => granted.has(permission)), missing: required.filter(permission => !granted.has(permission)) };
});

function mediaBlob(item) {
  if (item.filePath) {
    const allowedRoot = path.join(app.getPath('userData'), 'media-cache') + path.sep;
    const resolved = path.resolve(item.filePath);
    if (!resolved.startsWith(allowedRoot)) throw new Error(`Could not safely read ${item.name || 'media file'}.`);
    return new Blob([fs.readFileSync(resolved)], { type: item.type || 'application/octet-stream' });
  }
  const match = /^data:([^;,]+);base64,(.+)$/.exec(item.dataUrl || '');
  if (!match) throw new Error(`Could not read ${item.name || 'media file'}.`);
  return new Blob([Buffer.from(match[2], 'base64')], { type: match[1] });
}

ipcMain.handle('cache-media', (_event, item) => {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(item?.dataUrl || '');
  if (!match) throw new Error(`Could not prepare ${item?.name || 'media file'} for local storage.`);
  const folder = path.join(app.getPath('userData'), 'media-cache');
  fs.mkdirSync(folder, { recursive: true });
  const extension = path.extname(item.name || '').replace(/[^.a-z0-9]/gi, '').slice(0, 10) || (match[1].startsWith('video/') ? '.mp4' : '.jpg');
  const filePath = path.join(folder, `${randomUUID()}${extension}`);
  fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
  return { filePath, previewUrl: pathToFileURL(filePath).href, type: item.type || match[1], name: item.name || path.basename(filePath), size: fs.statSync(filePath).size };
});

function safeCachedPath(filePath) {
  const allowedRoot = path.join(app.getPath('userData'), 'media-cache') + path.sep;
  const resolved = path.resolve(filePath || '');
  if (!resolved.startsWith(allowedRoot)) throw new Error('The Story media file is outside Qu’s protected cache.');
  return resolved;
}

ipcMain.handle('transcode-story-video', async (_event, item) => {
  const input = safeCachedPath(item?.filePath), output = path.join(app.getPath('userData'), 'media-cache', `${randomUUID()}-story.mp4`);
  const ffmpeg = app.isPackaged ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : ffmpegStatic;
  await new Promise((resolve, reject) => {
    const process = spawn(ffmpeg, ['-y','-i',input,'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-an',output]);
    let errors = ''; process.stderr.on('data', chunk => { errors += chunk.toString(); if (errors.length > 12000) errors = errors.slice(-12000); });
    process.on('error', reject); process.on('close', code => code === 0 ? resolve() : reject(new Error(`Video conversion failed (${code}). ${errors.split('\n').slice(-3).join(' ')}`)));
  });
  return { filePath: output, previewUrl: pathToFileURL(output).href, type: 'video/mp4', name: path.basename(output), size: fs.statSync(output).size };
});

function giphyUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !(url.hostname === 'giphy.com' || url.hostname.endsWith('.giphy.com'))) throw new Error('That GIF is not hosted by GIPHY.');
  return url;
}

ipcMain.handle('search-giphy', async (_event, apiKey, query) => {
  if (!String(apiKey || '').trim()) throw new Error('Add your GIPHY API key first.');
  const term = String(query || '').trim();
  const endpoint = new URL(`https://api.giphy.com/v1/gifs/${term ? 'search' : 'trending'}`);
  endpoint.searchParams.set('api_key', String(apiKey).trim());
  endpoint.searchParams.set('limit', '24');
  endpoint.searchParams.set('rating', 'pg-13');
  if (term) endpoint.searchParams.set('q', term.slice(0, 50));
  const response = await fetch(endpoint, { headers: { accept: 'application/json' } });
  const result = await response.json();
  if (!response.ok || result.meta?.status >= 400) throw new Error(result.meta?.msg || `GIPHY search failed (${response.status}).`);
  return (result.data || []).map(gif => ({ id: gif.id, title: gif.title || 'GIPHY GIF', previewUrl: gif.images?.fixed_width_small?.webp || gif.images?.fixed_width?.webp, sourceUrl: gif.images?.original?.url, width: Number(gif.images?.original?.width) || 1, height: Number(gif.images?.original?.height) || 1 })).filter(gif => gif.previewUrl && gif.sourceUrl);
});

ipcMain.handle('import-giphy', async (_event, item) => {
  const url = giphyUrl(item?.sourceUrl);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GIPHY could not provide this GIF (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 25 * 1024 * 1024) throw new Error('This GIF is larger than Qu’s 25 MB Story limit.');
  const folder = path.join(app.getPath('userData'), 'media-cache'); fs.mkdirSync(folder, { recursive: true });
  const filePath = path.join(folder, `${randomUUID()}-giphy.gif`); fs.writeFileSync(filePath, bytes);
  return { filePath, previewUrl: pathToFileURL(filePath).href, type: 'image/gif', name: `${String(item?.title || 'giphy').replace(/[^a-z0-9-_ ]/gi, '').slice(0, 60) || 'giphy'}.gif`, size: bytes.length };
});

function fullCaption(post) {
  const tags = (post.hashtags || []).map(tag => `#${String(tag).replace(/^#+/, '').replace(/\s+/g, '')}`).join(' ');
  return [post.caption?.trim(), tags].filter(Boolean).join('\n\n');
}

async function pageCredentials(userToken, pageId) {
  const result = await graph('me/accounts', userToken, { params: { fields: 'id,name,access_token,instagram_business_account{id,username}' } });
  const page = (result.data || []).find(item => item.id === pageId);
  if (!page?.access_token) throw new Error('The selected Facebook Page is no longer available to this account.');
  return page;
}

async function uploadTemporaryMedia(service, accessToken, item) {
  const base = secureServiceUrl(service);
  const response = await fetch(new URL('/v1/media', base), {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': item.type, 'x-file-name': encodeURIComponent(item.name || 'media') },
    body: mediaBlob(item)
  });
  const result = await response.json();
  if (!response.ok || !result.url) throw new Error(result.error || `Temporary media upload failed (${response.status}).`);
  return result.url;
}

async function publishFacebook(post, page, userToken) {
  const credentials = await pageCredentials(userToken, page.id);
  const caption = fullCaption(post);
  const images = (post.media || []).filter(item => item.type.startsWith('image/'));
  const videos = (post.media || []).filter(item => item.type.startsWith('video/'));
  if (videos.length && (images.length || videos.length > 1)) throw new Error('Facebook mixed-media and multi-video posts are not supported by this release. Use one video or one or more photos.');
  if (videos.length === 1) {
    const form = new FormData(); form.set('description', caption); form.set('source', mediaBlob(videos[0]), videos[0].name || 'video');
    return graph(`${page.id}/videos`, credentials.access_token, { method: 'POST', form });
  }
  if (images.length === 1) {
    const form = new FormData(); form.set('caption', caption); form.set('source', mediaBlob(images[0]), images[0].name || 'photo');
    return graph(`${page.id}/photos`, credentials.access_token, { method: 'POST', form });
  }
  if (images.length > 1) {
    const ids = [];
    for (const image of images) {
      const form = new FormData(); form.set('published', 'false'); form.set('source', mediaBlob(image), image.name || 'photo');
      const uploaded = await graph(`${page.id}/photos`, credentials.access_token, { method: 'POST', form }); ids.push(uploaded.id);
    }
    return graph(`${page.id}/feed`, credentials.access_token, { method: 'POST', params: { message: caption, attached_media: JSON.stringify(ids.map(id => ({ media_fbid: id }))) } });
  }
  return graph(`${page.id}/feed`, credentials.access_token, { method: 'POST', params: { message: caption } });
}

async function uploadFacebookStoryVideo(uploadUrl, accessToken, item) {
  const blob = mediaBlob(item);
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { authorization: `OAuth ${accessToken}`, offset: '0', file_size: String(blob.size), 'content-type': 'application/octet-stream' },
    body: blob
  });
  const text = await response.text();
  let result = {};
  try { result = text ? JSON.parse(text) : {}; } catch { result = {}; }
  if (!response.ok || result.error || result.success === false) throw new Error(result.error?.message || `Facebook could not upload the Story video (${response.status}).`);
  return result;
}

async function publishFacebookReel(post, page, userToken) {
  const credentials = await pageCredentials(userToken, page.id);
  const items = post.media || [];
  if (items.length !== 1 || !items[0].type.startsWith('video/')) throw new Error('Facebook Reels require exactly one video.');
  const started = await graph(`${page.id}/video_reels`, credentials.access_token, { method: 'POST', params: { upload_phase: 'start' } });
  if (!started.video_id || !started.upload_url) throw new Error('Facebook did not create a Reel upload session.');
  await uploadFacebookStoryVideo(started.upload_url, credentials.access_token, items[0]);
  return graph(`${page.id}/video_reels`, credentials.access_token, { method: 'POST', params: { upload_phase: 'finish', video_id: started.video_id, video_state: 'PUBLISHED', description: fullCaption(post) } });
}

async function publishFacebookStory(post, page, userToken) {
  const credentials = await pageCredentials(userToken, page.id);
  const item = post.storyMedia || (post.media || [])[0];
  if (!item) throw new Error('Facebook Stories require a photo or video.');
  if (item.type.startsWith('video/')) {
    const started = await graph(`${page.id}/video_stories`, credentials.access_token, { method: 'POST', params: { upload_phase: 'start' } });
    if (!started.video_id || !started.upload_url) throw new Error('Facebook did not create a Story video upload session.');
    await uploadFacebookStoryVideo(started.upload_url, credentials.access_token, item);
    return graph(`${page.id}/video_stories`, credentials.access_token, { method: 'POST', params: { upload_phase: 'finish', video_id: started.video_id, video_state: 'PUBLISHED' } });
  }
  if (!item.type.startsWith('image/')) throw new Error('Facebook could not recognize the first Story media item.');
  const form = new FormData(); form.set('published', 'false'); form.set('source', mediaBlob(item), item.name || 'story.jpg');
  const uploaded = await graph(`${page.id}/photos`, credentials.access_token, { method: 'POST', form });
  return graph(`${page.id}/photo_stories`, credentials.access_token, { method: 'POST', params: { photo_id: uploaded.id } });
}

async function waitForContainer(containerId, token) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const status = await graph(containerId, token, { params: { fields: 'status_code,status' } });
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') throw new Error(status.status || 'Instagram could not process the uploaded media.');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Instagram media processing timed out.');
}

async function publishInstagram(post, page, userToken, service) {
  const credentials = await pageCredentials(userToken, page.id);
  const ig = credentials.instagram_business_account;
  if (!ig?.id) throw new Error('The selected Page has no linked Instagram professional account.');
  const items = post.media || [];
  if (!items.length) throw new Error('Instagram requires at least one photo or video.');
  const urls = [];
  for (const item of items) urls.push(await uploadTemporaryMedia(service, userToken, item));
  const caption = fullCaption(post);
  let container;
  if (items.length === 1) {
    const video = items[0].type.startsWith('video/');
    const params = video ? { media_type: 'REELS', video_url: urls[0], caption } : { image_url: urls[0], caption, alt_text:post.alt||'' };
    container = await graph(`${ig.id}/media`, credentials.access_token, { method: 'POST', params });
  } else {
    const children = [];
    for (let index = 0; index < items.length; index += 1) {
      const video = items[index].type.startsWith('video/');
      const params = video ? { media_type: 'VIDEO', video_url: urls[index], is_carousel_item: 'true' } : { image_url: urls[index], is_carousel_item: 'true' };
      const child = await graph(`${ig.id}/media`, credentials.access_token, { method: 'POST', params }); children.push(child.id);
    }
    container = await graph(`${ig.id}/media`, credentials.access_token, { method: 'POST', params: { media_type: 'CAROUSEL', children: children.join(','), caption } });
  }
  await waitForContainer(container.id, credentials.access_token);
  return graph(`${ig.id}/media_publish`, credentials.access_token, { method: 'POST', params: { creation_id: container.id } });
}

async function publishInstagramReel(post, page, userToken, service) {
  const items = post.media || [];
  if (items.length !== 1 || !items[0].type.startsWith('video/')) throw new Error('Instagram Reels require exactly one video.');
  return publishInstagram(post, page, userToken, service);
}

async function publishInstagramStory(post, page, userToken, service) {
  const credentials = await pageCredentials(userToken, page.id);
  const ig = credentials.instagram_business_account;
  if (!ig?.id) throw new Error('The selected Page has no linked Instagram professional account.');
  const item = post.storyMedia || (post.media || [])[0];
  if (!item || !/^(image|video)\//.test(item.type || '')) throw new Error('Instagram Stories require a photo or video.');
  const url = await uploadTemporaryMedia(service, userToken, item);
  const mediaParameter = item.type.startsWith('video/') ? 'video_url' : 'image_url';
  const container = await graph(`${ig.id}/media`, credentials.access_token, { method: 'POST', params: { media_type: 'STORIES', [mediaParameter]: url } });
  await waitForContainer(container.id, credentials.access_token);
  return graph(`${ig.id}/media_publish`, credentials.access_token, { method: 'POST', params: { creation_id: container.id } });
}

ipcMain.handle('publish-meta-post', async (_event, payload) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Protected credential storage is unavailable.');
  const token = safeStorage.decryptString(Buffer.from(payload.protectedToken, 'base64'));
  const result = { successes: {}, errors: {} };
  const primaryTask=payload.post.format==='reel'?'Reel':'Feed';
  const tasks=payload.post.tasks||payload.post.destinations.flatMap(destination=>[`${destination}${primaryTask}`,...(payload.post.addToStory?[`${destination}Story`]:[])]);
  if(tasks.includes('FacebookFeed'))try{result.successes.FacebookFeed=await publishFacebook(payload.post,payload.page,token)}catch(error){result.errors.FacebookFeed=error.message}
  if(tasks.includes('FacebookReel'))try{result.successes.FacebookReel=await publishFacebookReel(payload.post,payload.page,token)}catch(error){result.errors.FacebookReel=error.message}
  if(tasks.includes('FacebookStory'))try{result.successes.FacebookStory=await publishFacebookStory(payload.post,payload.page,token)}catch(error){result.errors.FacebookStory=error.message}
  if(tasks.includes('InstagramFeed'))try{result.successes.InstagramFeed=await publishInstagram(payload.post,payload.page,token,payload.service)}catch(error){result.errors.InstagramFeed=error.message}
  if(tasks.includes('InstagramReel'))try{result.successes.InstagramReel=await publishInstagramReel(payload.post,payload.page,token,payload.service)}catch(error){result.errors.InstagramReel=error.message}
  if(tasks.includes('InstagramStory'))try{result.successes.InstagramStory=await publishInstagramStory(payload.post,payload.page,token,payload.service)}catch(error){result.errors.InstagramStory=error.message}
  return result;
});

ipcMain.handle('protect-token', (_event, token) => {
  if (!token) return '';
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Protected credential storage is unavailable.');
  return safeStorage.encryptString(token).toString('base64');
});

ipcMain.handle('unprotect-token', (_event, value) => {
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Protected credential storage is unavailable.');
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
});
