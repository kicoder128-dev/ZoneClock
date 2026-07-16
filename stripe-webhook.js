// netlify/functions/stripe-webhook.js
// Receives Stripe webhook events and updates Supabase premium status.
//
// In Stripe Dashboard → Webhooks → Add endpoint:
//   URL: https://YOUR-SITE.netlify.app/.netlify/functions/stripe-webhook
//   Events: checkout.session.completed, customer.subscription.deleted,
//           customer.subscription.updated, invoice.payment_failed

const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'Method Not Allowed' };

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET)
    return { statusCode: 503, body: 'Stripe not configured' };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return { statusCode: 503, body: 'Supabase not configured' };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Verify webhook signature
  let stripeEvent;
  try {
    const sig = event.headers['stripe-signature'];
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const now = new Date().toISOString();

  try {
    switch (stripeEvent.type) {

      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        const email   = session.customer_email || session.metadata?.email;
        const subId   = session.subscription;
        const custId  = session.customer;
        if (!email) break;

        await supabase.from('premium_users').upsert({
          email,
          stripe_customer_id:     custId,
          stripe_subscription_id: subId,
          is_premium: true,
          updated_at: now,
        }, { onConflict: 'email' });
        console.log('Premium activated for:', email);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = stripeEvent.data.object;
        const custId  = invoice.customer;
        const subId   = invoice.subscription;
        // Renew by ensuring is_premium stays true
        await supabase.from('premium_users')
          .update({ is_premium: true, updated_at: now })
          .eq('stripe_customer_id', custId);
        break;
      }

      case 'customer.subscription.deleted':
      case 'invoice.payment_failed': {
        const obj    = stripeEvent.data.object;
        const custId = obj.customer;
        await supabase.from('premium_users')
          .update({ is_premium: false, updated_at: now })
          .eq('stripe_customer_id', custId);
        console.log('Premium revoked for customer:', custId);
        break;
      }

      default:
        console.log('Unhandled event type:', stripeEvent.type);
    }
  } catch (err) {
    console.error('Database error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
