/* ═══════════════════════════════════════════════════════
   netlify/functions/stripe-webhook.js
   Handles Stripe webhooks → updates Supabase premium status.

   In Stripe Dashboard → Webhooks, point to:
     https://yoursite.netlify.app/.netlify/functions/stripe-webhook
   Events to listen for:
     checkout.session.completed
     customer.subscription.deleted
     customer.subscription.updated
     invoice.payment_failed

   Add STRIPE_WEBHOOK_SECRET to Netlify env vars.
═══════════════════════════════════════════════════════ */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body, sig, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const setPremium = async (userId, isPremium, stripeCustomerId = null) => {
    const update = { is_premium: isPremium, updated_at: new Date().toISOString() };
    if (stripeCustomerId) update.stripe_customer_id = stripeCustomerId;
    const { error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', userId);
    if (error) console.error('Supabase update error:', error);
  };

  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      const session = stripeEvent.data.object;
      if (session.mode === 'subscription' && session.payment_status === 'paid') {
        await setPremium(session.client_reference_id, true, session.customer);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      // Find user by stripe_customer_id
      const sub = stripeEvent.data.object;
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', sub.customer)
        .single();
      if (data) await setPremium(data.id, false);
      break;
    }
    case 'invoice.payment_failed': {
      const inv = stripeEvent.data.object;
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', inv.customer)
        .single();
      if (data) await setPremium(data.id, false);
      break;
    }
    case 'customer.subscription.updated': {
      const sub = stripeEvent.data.object;
      const active = ['active', 'trialing'].includes(sub.status);
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', sub.customer)
        .single();
      if (data) await setPremium(data.id, active);
      break;
    }
  }

  return { statusCode: 200, body: 'ok' };
};
