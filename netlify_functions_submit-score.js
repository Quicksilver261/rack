// Example Netlify Function for submitting scores to Supabase
// Place under your Netlify functions folder (netlify/functions/submit-score.js)
// Requires environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE

const fetch = global.fetch || require('node-fetch');

// Simple in-memory rate limit (per-instance, not robust but helps)
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_PER_WINDOW = 20;
const ipMap = new Map();

exports.handler = async function(event) {
  if(event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try{
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return { statusCode: 500, body: 'Server not configured' };

    const ip = (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown';
    const now = Date.now();
    const entry = ipMap.get(ip) || {count:0, start: now};
    if(now - entry.start > RATE_WINDOW_MS){ entry.count = 0; entry.start = now; }
    entry.count++;
    ipMap.set(ip, entry);
    if(entry.count > MAX_PER_WINDOW) return { statusCode: 429, body: 'Too Many Requests' };

    const body = JSON.parse(event.body || '{}');
    const name = String(body.name || 'Anonymous').trim().slice(0,64);
    const score = Number(body.score || 0);
    const date = body.date || new Date().toISOString().slice(0,10);

    // Basic validation
    if(!name) return { statusCode: 400, body: 'Bad Request: name required' };
    if(Number.isNaN(score) || !isFinite(score)) return { statusCode: 400, body: 'Bad Request: invalid score' };

    const url = `${SUPABASE_URL}/rest/v1/leaderboard`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify([{ name, score, date }])
    });

    const text = await res.text();
    if(!res.ok) return { statusCode: 500, body: `Supabase error ${res.status}: ${text}` };
    return { statusCode: 200, body: text };
  }catch(e){
    return { statusCode: 500, body: String(e) };
  }
}