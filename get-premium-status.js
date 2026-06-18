/* ═══════════════════════════════════════════════════════
   netlify/functions/get-premium-status.js
   Returns premium status for a logged-in user.
   Called by the app on login to sync premium state.
═══════════════════════════════════════════════════════ */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { userId } = body;
  if (!userId) return { statusCode: 400, body: 'userId required' };

  const { data, error } = await supabase
    .from('profiles')
    .select('is_premium, stripe_customer_id')
    .eq('id', userId)
    .single();

  if (error) return { statusCode: 404, body: 'User not found' };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPremium: data.is_premium || false }),
  };
};
