// netlify/functions/get-premium-status.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'Method Not Allowed' };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return { statusCode: 503, body: JSON.stringify({ error: 'Supabase not configured' }) };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { userId } = body;
  if (!userId) return { statusCode: 400, body: JSON.stringify({ error: 'userId required' }) };

  try {
    const { data, error } = await supabase
      .from('premium_users')
      .select('is_premium, expires_at, stripe_subscription_id')
      .eq('id', userId)
      .single();

    if (error || !data)
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ premium: false }) };

    let isPremium = data.is_premium;
    if (isPremium && data.expires_at)
      isPremium = new Date(data.expires_at) > new Date();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ premium: isPremium, subscription_id: data.stripe_subscription_id }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
