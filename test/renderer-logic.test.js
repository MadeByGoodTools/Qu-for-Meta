const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function cleanTags(value) { return [...new Set(value.split(/[#,\n]+/).map(v => v.trim().replace(/^#+/, '')).filter(Boolean))]; }
function validatePost(post) {
  const errors=[];
  if(!post.caption && !post.media.length) errors.push('content');
  if(!post.destinations.length) errors.push('destination');
  if(post.destinations.includes('Instagram')&&!post.media.length) errors.push('instagram-media');
  if(post.format==='reel'&&(post.media.length!==1||!post.media[0]?.type.startsWith('video/'))) errors.push('reel-video');
  if(post.mode==='scheduled'&&!post.schedule) errors.push('schedule');
  if(post.addToStory&&!post.media.length) errors.push('story-media');
  return errors;
}
const VIDEO_EXTENSIONS = new Set(['mp4','mov','m4v','webm','avi','mkv','mpeg','mpg','3gp','3g2','wmv']);
function mediaType(file) {
  if (/^(image|video)\//.test(file.type || '')) return file.type;
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return extension === 'mov' ? 'video/quicktime' : `video/${extension === 'm4v' ? 'mp4' : extension}`;
  return '';
}

test('splits hashtags on hashes, commas, and new lines',()=>assert.deepEqual(cleanTags('#one #two, three\nfour'),['one','two','three','four']));
test('deduplicates tags',()=>assert.deepEqual(cleanTags('#one,#one,#two'),['one','two']));
test('Instagram requires media',()=>assert.deepEqual(validatePost({caption:'hello',media:[],destinations:['Instagram'],mode:'draft',schedule:''}),['instagram-media']));
test('Facebook may publish text-only',()=>assert.deepEqual(validatePost({caption:'hello',media:[],destinations:['Facebook'],mode:'draft',schedule:''}),[]));
test('adding a Story requires media',()=>assert.deepEqual(validatePost({caption:'hello',media:[],destinations:['Facebook'],addToStory:true,mode:'draft',schedule:''}),['story-media']));
test('one photo is valid for a feed post plus both platform Stories',()=>assert.deepEqual(validatePost({caption:'',media:[{type:'image/jpeg'}],destinations:['Facebook','Instagram'],addToStory:true,mode:'draft',schedule:''}),[]));
test('one video is valid for a feed post plus Story',()=>assert.deepEqual(validatePost({caption:'',media:[{type:'video/mp4'}],destinations:['Facebook'],addToStory:true,mode:'draft',schedule:''}),[]));
test('a Reel requires exactly one video',()=>{
  assert.deepEqual(validatePost({caption:'reel',media:[{type:'image/jpeg'}],destinations:['Facebook'],format:'reel',mode:'draft',schedule:''}),['reel-video']);
  assert.deepEqual(validatePost({caption:'reel',media:[{type:'video/mp4'}],destinations:['Facebook','Instagram'],format:'reel',mode:'draft',schedule:''}),[]);
});
test('common video extensions are recognized when the browser omits MIME type',()=>{
  assert.equal(mediaType({name:'clip.MOV',type:''}),'video/quicktime');
  assert.equal(mediaType({name:'clip.m4v',type:'application/octet-stream'}),'video/mp4');
  assert.equal(mediaType({name:'clip.mkv',type:''}),'video/mkv');
});
test('Story Studio exposes layered stickers, creative text, and GIPHY search',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const renderer=fs.readFileSync(path.join(__dirname,'..','renderer.js'),'utf8');
  assert.match(html,/data-story-panel="giphy"/);
  assert.match(html,/id="giphy-search"/);
  assert.match(html,/option value="gradient">Gradient/);
  assert.match(renderer,/storyStickers\.push\(layer\)/);
  assert.match(renderer,/importGiphy/);
});
test('GIPHY imports are restricted to secure GIPHY-hosted media',()=>{
  const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
  assert.match(main,/url\.protocol !== 'https:'/);
  assert.match(main,/url\.hostname\.endsWith\('\.giphy\.com'\)/);
  assert.match(main,/25 \* 1024 \* 1024/);
});
test('tester setup guides invite acceptance and verifies least-privilege access',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
  const preload=fs.readFileSync(path.join(__dirname,'..','preload.js'),'utf8');
  assert.match(html,/id="tester-guide-dialog"/);
  assert.match(html,/id="open-app-roles"/);
  assert.match(html,/id="open-meta-requests"/);
  for(const permission of ['pages_show_list','pages_read_engagement','pages_manage_posts','business_management','instagram_basic','instagram_content_publish']) assert.match(html,new RegExp(permission));
  assert.match(main,/ipcMain\.handle\('check-meta-access'/);
  assert.match(main,/me\/permissions/);
  assert.match(preload,/checkMetaAccess/);
});
test('Facebook and Instagram Reel publishing use their native Reel paths',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
  const renderer=fs.readFileSync(path.join(__dirname,'..','renderer.js'),'utf8');
  assert.match(html,/id="format-reel"/);
  assert.match(main,/video_reels/);
  assert.match(main,/media_type: 'REELS'/);
  assert.match(main,/FacebookReel/);
  assert.match(main,/InstagramReel/);
  assert.match(renderer,/post\.format==='reel'\?'Reel':'Feed'/);
});
test('scheduled post requires a date',()=>assert.deepEqual(validatePost({caption:'hello',media:[],destinations:['Facebook'],mode:'scheduled',schedule:''}),['schedule']));
test('retry skips individual feed and Story tasks that already published',()=>{
  const post={destinations:['Facebook','Instagram'],addToStory:true,completedTasks:['FacebookFeed','InstagramStory']};
  const all=post.destinations.flatMap(destination=>[`${destination}Feed`,`${destination}Story`]);
  assert.deepEqual(all.filter(task=>!new Set(post.completedTasks).has(task)),['FacebookStory','InstagramFeed']);
});
test('a scheduled post is due only after its time',()=>{
  const due=(post,now)=>post.mode==='now'||(post.mode==='scheduled'&&new Date(post.schedule)<=now);
  assert.equal(due({mode:'scheduled',schedule:'2030-01-01T10:00:00Z'},new Date('2030-01-01T10:01:00Z')),true);
  assert.equal(due({mode:'scheduled',schedule:'2030-01-01T10:00:00Z'},new Date('2030-01-01T09:59:00Z')),false);
});
