// netlify/functions/check-premium.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'Method Not Allowed' };

  // Initialize inside handler so missing env vars don't crash on cold start
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return { statusCode: 503, body: JSON.stringify({ error: 'Supabase not configured' }) };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { email } = body;
  if (!email) return { statusCode: 400, body: JSON.stringify({ error: 'Email required' }) };

  try {
    const { data, error } = await supabase
      .from('premium_users')
      .select('is_premium, expires_at')
      .eq('email', email)
      .single();

    if (error || !data)
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ premium: false }) };

    let isPremium = data.is_premium;
    if (isPremium && data.expires_at)
      isPremium = new Date(data.expires_at) > new Date();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ premium: isPremium }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
