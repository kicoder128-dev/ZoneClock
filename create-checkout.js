/* ═══════════════════════════════════════════════════════
   netlify/functions/create-checkout.js
   Creates a Stripe Checkout session for ZoneClock Premium.

   Environment variables (set in Netlify dashboard → Site settings → Env vars):
     STRIPE_SECRET_KEY     — Stripe secret key (sk_live_...)
     STRIPE_PRICE_ID       — Stripe Price ID (price_...) for $5/month
     SUPABASE_URL          — Supabase project URL
     SUPABASE_SERVICE_KEY  — Supabase service role key (secret)
     APP_URL               — Your live site URL e.g. https://zoneclock.app
═══════════════════════════════════════════════════════ */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { userId, email } = body;
  if (!userId || !email)
    return { statusCode: 400, body: 'userId and email required' };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      customer_email: email,
      client_reference_id: userId,
      metadata: { userId },
      success_url: `${process.env.APP_URL}?payment=success`,
      cancel_url:  `${process.env.APP_URL}?payment=cancelled`,
      subscription_data: {
        metadata: { userId },
        trial_period_days: 7,
      },
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
