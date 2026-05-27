const fetch = global.fetch || require('node-fetch');

exports.handler = async function(event) {
  try{
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return { statusCode: 500, body: 'Server not configured' };
    if(!/supabase\.co/i.test(SUPABASE_URL)) return { statusCode: 500, body: 'Server misconfigured: SUPABASE_URL must point to your Supabase project URL' };

    // accept ?date=YYYY-MM-DD or default today
    const date = (event.queryStringParameters && event.queryStringParameters.date) || new Date().toISOString().slice(0,10);
    const url = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1/leaderboard?select=name,score,date&date=eq.${encodeURIComponent(date)}&order=score.desc&limit=50`;

    // Debug mode: if ?debug=1 is provided, return the constructed URL and status for debugging.
    const debug = event.queryStringParameters && (event.queryStringParameters.debug === '1' || event.queryStringParameters.debug === 'true');

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`
      }
    });
    const text = await res.text();
    if(debug){
      // DO NOT include the service role key in the response. Return the URL and Supabase status/text for debugging.
      const out = {
        url,
        supabase_status: res.status,
        supabase_body: text
      };
      console.log('DEBUG get-leaderboard:', out);
      return { statusCode: 200, body: JSON.stringify(out), headers: { 'Content-Type': 'application/json' } };
    }

    if(!res.ok) return { statusCode: res.status, body: text };
    return { statusCode: 200, body: text, headers: { 'Content-Type': 'application/json' } };
  }catch(e){
    return { statusCode: 500, body: String(e) };
  }
};
