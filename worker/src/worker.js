const SESSION_TTL = 15 * 60;
const RESULT_TTL = 5 * 60;
const CONFIG_PERMISSIONS = [
  "public_profile",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
  "instagram_basic",
  "instagram_content_publish"
];

function randomToken(bytes = 32) {
  const values = new Uint8Array(bytes); crypto.getRandomValues(values);
  return [...values].map(v => v.toString(16).padStart(2, "0")).join("");
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"} });
}

function callbackPage(ok, message) {
  const safe = String(message).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${ok?"Meta connected":"Connection failed"} — Qu</title><style>body{margin:0;background:#0b0d12;color:#f8fafc;font:16px system-ui;display:grid;min-height:100vh;place-items:center}.card{width:min(34rem,calc(100% - 3rem));padding:2.5rem;border:1px solid #343a46;border-radius:24px;background:#141820;box-shadow:0 30px 90px #0009}h1{margin-top:0;color:${ok?"#86efac":"#fda4af"}}p{color:#cbd5e1;line-height:1.6}</style><main class="card"><h1>${ok?"Meta connected":"Connection failed"}</h1><p>${safe}</p><p>You may close this page and return to Qu.</p></main>`, {status:ok?200:400,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-frame-options":"DENY"}});
}

function legalPage(title, body) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} — Qu for Meta</title><style>body{margin:0;background:#0b0d12;color:#f8fafc;font:16px/1.65 system-ui,-apple-system,sans-serif}.page{width:min(48rem,calc(100% - 3rem));margin:0 auto;padding:4rem 0 6rem}h1,h2{line-height:1.2}h1{font-size:clamp(2rem,6vw,3.5rem);margin-bottom:.4rem}h2{margin-top:2.2rem;color:#f0abfc}p,li{color:#cbd5e1}a{color:#93c5fd}.meta{color:#94a3b8}.card{margin-top:2rem;padding:1.5rem;border:1px solid #343a46;border-radius:20px;background:#141820}</style></head><body><main class="page">${body}</main></body></html>`, {headers:{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=300","x-content-type-options":"nosniff","x-frame-options":"DENY"}});
}

function privacyPage() {
  return legalPage("Privacy Policy", `<p class="meta">Qu for Meta · Effective September 1, 2026</p><h1>Privacy Policy</h1><p>Qu for Meta is a desktop publishing tool operated through the Level12Ent. Meta business portfolio. It helps people prepare, schedule, and publish content to Facebook Pages and linked Instagram professional accounts they are authorized to manage.</p><h2>Information Qu uses</h2><ul><li>Meta account identifiers and the list of Facebook Pages and linked Instagram professional accounts available to the signed-in user.</li><li>Meta access tokens granted during authorization.</li><li>Post text, hashtags, alt text, images, videos, schedules, and destination selections supplied by the user.</li><li>Short-lived authorization-session data required to complete sign-in.</li></ul><h2>How information is used</h2><p>Qu uses this information only to authenticate the user, show eligible publishing destinations, save the user's local workspace, and publish content at the user's request. Qu does not sell personal information or use Meta Platform Data for advertising.</p><h2>Storage and retention</h2><p>Drafts and schedules are stored locally on the user's computer. Access tokens are encrypted using the operating system's protected credential storage. The authorization service keeps pending sign-in sessions for up to 15 minutes, completed sign-in results for up to 5 minutes, and temporary media uploads for up to 1 hour before automatic deletion.</p><h2>Service providers</h2><p>Qu communicates with Meta to authenticate accounts and publish content. Cloudflare operates the authorization and temporary-media service. AI websites displayed in Qu are direct sessions with the provider selected by the user; Qu does not receive or store those conversations.</p><h2>User control and deletion</h2><p>Users can disconnect Meta inside Qu, remove local drafts from the Visual Queue, and remove Qu's authorization through Facebook's business integrations settings. See the <a href="/data-deletion">data deletion instructions</a> for full steps.</p><h2>Security</h2><p>Qu requests only the permissions needed for Page and Instagram publishing. The Meta App Secret remains on the authorization service and is never distributed in the desktop application.</p><h2>Contact</h2><p>Privacy and deletion requests may be sent to <a href="mailto:hiphopdmg@gmail.com">hiphopdmg@gmail.com</a>.</p><div class="card"><p>This policy may be updated when Qu's features or legal obligations change. The effective date above identifies the current version.</p></div>`);
}

function deletionPage() {
  return legalPage("Data Deletion", `<p class="meta">Qu for Meta</p><h1>Data deletion instructions</h1><p>You can stop Qu from accessing Meta and remove its locally stored workspace at any time.</p><h2>1. Disconnect Meta in Qu</h2><p>Open the account switcher, choose <strong>Disconnect Meta</strong>, and confirm. This removes the protected access token from Qu while keeping local drafts unless you remove them separately.</p><h2>2. Clear local Qu content</h2><p>In Visual Queue, choose <strong>Clear Qu</strong> to remove all locally saved drafts, schedules, and publishing history. This does not delete posts already published on Facebook or Instagram.</p><h2>3. Remove Meta authorization</h2><p>In Facebook, open Settings &amp; privacy, then Settings, Business integrations, select Qu Social Publisher, and choose Remove. Meta may change the wording or location of these controls.</p><h2>4. Request assistance</h2><p>For help with a deletion request, email <a href="mailto:hiphopdmg@gmail.com">hiphopdmg@gmail.com</a> with the subject “Qu data deletion request.” Do not include passwords or access tokens.</p><div class="card"><p>Qu's cloud authorization sessions and temporary uploads expire automatically within the retention periods stated in the <a href="/privacy">Privacy Policy</a>.</p></div>`);
}

function requireConfig(env) {
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_CONFIG_ID || !env.QU_META_SESSIONS) throw new Error("Qu Meta authorization is not configured yet.");
}

function redirectUri(request) { return `${new URL(request.url).origin}/v1/oauth/callback`; }

async function start(request, env) {
  requireConfig(env);
  const sessionId = randomToken(24), sessionKey = randomToken(32), state = randomToken(32);
  await Promise.all([
    env.QU_META_SESSIONS.put(`session:${sessionId}`, JSON.stringify({status:"pending",sessionKey,state,createdAt:Date.now()}), {expirationTtl:SESSION_TTL}),
    env.QU_META_SESSIONS.put(`state:${state}`, sessionId, {expirationTtl:SESSION_TTL})
  ]);
  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.searchParams.set("client_id", env.META_APP_ID);
  url.searchParams.set("redirect_uri", redirectUri(request));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("config_id", env.META_CONFIG_ID);
  return response({authorizeUrl:url.toString(),sessionId,sessionKey,expiresIn:SESSION_TTL},201);
}

async function callback(request, env) {
  requireConfig(env);
  const url = new URL(request.url), state = url.searchParams.get("state"), code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return callbackPage(false, url.searchParams.get("error_description") || url.searchParams.get("error"));
  if (!state || !code) return callbackPage(false, "Meta did not return a complete authorization response.");
  const sessionId = await env.QU_META_SESSIONS.get(`state:${state}`);
  const session = sessionId && await env.QU_META_SESSIONS.get(`session:${sessionId}`, "json");
  if (!session || session.state !== state) return callbackPage(false, "This authorization attempt expired. Start again in Qu.");
  try {
    const tokenUrl = new URL("https://graph.facebook.com/oauth/access_token");
    tokenUrl.searchParams.set("client_id", env.META_APP_ID);
    tokenUrl.searchParams.set("client_secret", env.META_APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", redirectUri(request));
    tokenUrl.searchParams.set("code", code);
    const tokenResponse = await fetch(tokenUrl, {headers:{accept:"application/json"}});
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) throw new Error(token.error?.message || `Meta token exchange failed (${tokenResponse.status}).`);
    const longUrl = new URL("https://graph.facebook.com/oauth/access_token");
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", env.META_APP_ID);
    longUrl.searchParams.set("client_secret", env.META_APP_SECRET);
    longUrl.searchParams.set("fb_exchange_token", token.access_token);
    const longResponse = await fetch(longUrl, {headers:{accept:"application/json"}});
    const longToken = await longResponse.json();
    const accessToken = longResponse.ok && longToken.access_token ? longToken.access_token : token.access_token;
    await env.QU_META_SESSIONS.put(`session:${sessionId}`, JSON.stringify({status:"complete",sessionKey:session.sessionKey,accessToken,expiresIn:longToken.expires_in || token.expires_in || null,completedAt:Date.now()}), {expirationTtl:RESULT_TTL});
    await env.QU_META_SESSIONS.delete(`state:${state}`);
    return callbackPage(true, "Qu can now finish loading your Facebook Pages and linked Instagram accounts.");
  } catch (error) {
    await env.QU_META_SESSIONS.put(`session:${sessionId}`, JSON.stringify({status:"failed",sessionKey:session.sessionKey,message:error.message}), {expirationTtl:RESULT_TTL});
    return callbackPage(false, error.message);
  }
}

async function status(request, env, id) {
  requireConfig(env);
  const session = await env.QU_META_SESSIONS.get(`session:${id}`, "json");
  const supplied = request.headers.get("x-qu-session-key") || "";
  if (!session || !supplied || supplied !== session.sessionKey) return response({error:"Authorization session not found."},404);
  if (session.status === "complete") return response({status:"complete",accessToken:session.accessToken,expiresIn:session.expiresIn});
  if (session.status === "failed") return response({status:"failed",message:session.message},400);
  return response({status:"pending"},202);
}

async function uploadMedia(request, env) {
  requireConfig(env);
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return response({error:'Meta authorization is required.'},401);
  const contentType = request.headers.get('content-type') || '';
  if (!/^(image|video)\//i.test(contentType)) return response({error:'Only image and video uploads are accepted.'},415);
  const declaredSize = Number(request.headers.get('content-length') || 0);
  if (declaredSize > 24 * 1024 * 1024) return response({error:'Media must be smaller than 24 MB.'},413);
  const check = await fetch(`https://graph.facebook.com/v23.0/me?fields=id&access_token=${encodeURIComponent(token)}`, {headers:{accept:'application/json'}});
  if (!check.ok) return response({error:'The Meta connection has expired. Reconnect Qu and try again.'},401);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 24 * 1024 * 1024) return response({error:'Media must be between 1 byte and 24 MB.'},413);
  const key = randomToken(24);
  await env.QU_META_SESSIONS.put(`media:${key}`, bytes, {expirationTtl:60 * 60, metadata:{contentType}});
  return response({url:`${new URL(request.url).origin}/v1/media/${key}`,expiresIn:3600},201);
}

async function serveMedia(env, key) {
  const stored = await env.QU_META_SESSIONS.getWithMetadata(`media:${key}`, 'arrayBuffer');
  if (!stored?.value) return new Response('Not found', {status:404,headers:{'cache-control':'no-store'}});
  return new Response(stored.value, {headers:{'content-type':stored.metadata?.contentType || 'application/octet-stream','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
}

export default { async fetch(request, env) {
  const url = new URL(request.url);
  try {
    if (request.method === "GET" && url.pathname === "/privacy") return privacyPage();
    if (request.method === "GET" && url.pathname === "/data-deletion") return deletionPage();
    if (request.method === "GET" && url.pathname === "/health") return response({ok:true,configured:Boolean(env.META_APP_ID && env.META_APP_SECRET && env.META_CONFIG_ID && env.QU_META_SESSIONS)});
    if (request.method === "POST" && url.pathname === "/v1/oauth/start") return start(request, env);
    if (request.method === "GET" && url.pathname === "/v1/oauth/callback") return callback(request, env);
    if (request.method === "POST" && url.pathname === "/v1/media") return uploadMedia(request, env);
    const mediaMatch = url.pathname.match(/^\/v1\/media\/([a-f0-9]+)$/);
    if (request.method === "GET" && mediaMatch) return serveMedia(env, mediaMatch[1]);
    const match = url.pathname.match(/^\/v1\/oauth\/session\/([^/]+)$/);
    if (request.method === "GET" && match) return status(request, env, match[1]);
    return response({error:"Not found"},404);
  } catch (error) { return response({error:error.message || "Authorization service error."},500); }
}};
