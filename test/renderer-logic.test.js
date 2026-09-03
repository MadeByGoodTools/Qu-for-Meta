const test = require('node:test');
const assert = require('node:assert/strict');

function cleanTags(value) { return [...new Set(value.split(/[#,\n]+/).map(v => v.trim().replace(/^#+/, '')).filter(Boolean))]; }
function validatePost(post) {
  const errors=[];
  if(!post.caption && !post.media.length) errors.push('content');
  if(!post.destinations.length) errors.push('destination');
  if(post.destinations.includes('Instagram')&&!post.media.length) errors.push('instagram-media');
  if(post.mode==='scheduled'&&!post.schedule) errors.push('schedule');
  if(post.addToStory&&!post.media.length) errors.push('story-media');
  if(post.addToStory&&post.media[0]&&!post.media[0].type.startsWith('image/')) errors.push('story-image');
  return errors;
}

test('splits hashtags on hashes, commas, and new lines',()=>assert.deepEqual(cleanTags('#one #two, three\nfour'),['one','two','three','four']));
test('deduplicates tags',()=>assert.deepEqual(cleanTags('#one,#one,#two'),['one','two']));
test('Instagram requires media',()=>assert.deepEqual(validatePost({caption:'hello',media:[],destinations:['Instagram'],mode:'draft',schedule:''}),['instagram-media']));
test('Facebook may publish text-only',()=>assert.deepEqual(validatePost({caption:'hello',media:[],destinations:['Facebook'],mode:'draft',schedule:''}),[]));
test('adding a Story requires an image',()=>assert.deepEqual(validatePost({caption:'hello',media:[],destinations:['Facebook'],addToStory:true,mode:'draft',schedule:''}),['story-media']));
test('one photo is valid for a feed post plus both platform Stories',()=>assert.deepEqual(validatePost({caption:'',media:[{type:'image/jpeg'}],destinations:['Facebook','Instagram'],addToStory:true,mode:'draft',schedule:''}),[]));
test('adding a Story rejects video as the first media item',()=>assert.deepEqual(validatePost({caption:'',media:[{type:'video/mp4'}],destinations:['Facebook'],addToStory:true,mode:'draft',schedule:''}),['story-image']));
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
