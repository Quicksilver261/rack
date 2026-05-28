// Cloudflare Worker proxy for Supabase leaderboard
// Bindings required (set via Wrangler or Cloudflare dashboard):
// SUPABASE_URL, SUPABASE_SERVICE_ROLE

addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});

async function handle(req){
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');

  if(req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

  if(path.endsWith('/get-leaderboard')) return getLeaderboard(url);
  if(path.endsWith('/submit-score') && req.method === 'POST') return submitScore(req);

  return new Response('Not found', { status: 404, headers: cors() });
}

function cors(){ return { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,POST,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type' } }

function jsonResponse(obj, status=200){ return new Response(JSON.stringify(obj), { status, headers: Object.assign({'Content-Type':'application/json'}, cors()) }); }

async function getLeaderboard(url){
  const date = url.searchParams.get('date');
  if(!date) return jsonResponse({ error: 'missing date' }, 400);

  const SUPABASE_URL = SUPABASE_URL_BINDING || SUPABASE_URL;
  const SERVICE_ROLE = SUPABASE_SERVICE_ROLE_BINDING || SUPABASE_SERVICE_ROLE;
  if(!SUPABASE_URL || !SERVICE_ROLE) return jsonResponse({ error: 'server misconfigured' }, 500);

  const q = `select=*&order=score.desc&limit=50&date=eq.${encodeURIComponent(date)}`;
  const endpoint = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1/leaderboard?${q}`;

  const res = await fetch(endpoint, { method: 'GET', headers: { 'apikey': SERVICE_ROLE, 'Authorization': `Bearer ${SERVICE_ROLE}` } });
  const body = await res.text();
  try{ const parsed = JSON.parse(body); return jsonResponse(parsed, res.status); }catch(e){ return new Response(body, { status: res.status, headers: cors() }); }
}

async function submitScore(req){
  let payload;
  try{ payload = await req.json(); }catch(e){ return jsonResponse({ error: 'invalid json' }, 400); }
  const name = String(payload.name || '').slice(0,48).trim();
  const score = Number(payload.score || 0);
  const date = String(payload.date || '').slice(0,16);
  if(!name || !Number.isFinite(score) || !date) return jsonResponse({ error: 'invalid payload' }, 400);

  const SUPABASE_URL = SUPABASE_URL_BINDING || SUPABASE_URL;
  const SERVICE_ROLE = SUPABASE_SERVICE_ROLE_BINDING || SUPABASE_SERVICE_ROLE;
  if(!SUPABASE_URL || !SERVICE_ROLE) return jsonResponse({ error: 'server misconfigured' }, 500);

  const endpoint = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1/leaderboard`;
  const body = JSON.stringify({ name, score, date });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE,
      'Authorization': `Bearer ${SERVICE_ROLE}`,
      'Prefer': 'return=representation'
    },
    body
  });

  const text = await res.text();
  try{ const parsed = JSON.parse(text); return jsonResponse(parsed, res.status); }catch(e){ return new Response(text, { status: res.status, headers: cors() }); }
}
