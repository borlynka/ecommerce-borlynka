'use server';

import Stripe from 'stripe';
import { redirect } from 'next/navigation';

// 1) Load Stripe secret
const sk = process.env.STRIPE_SECRET_KEY;
if (!sk) throw new Error('STRIPE_SECRET_KEY is missing in .env.local');
const stripe = new Stripe(sk);

// 2) Base URL from env (must include http:// or https://)
function getBaseUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (!/^https?:\/\//i.test(base)) {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL must be a full URL (e.g., http://localhost:4321 or https://your-domain.com)'
    );
  }
  return base.replace(/\/+$/, '');
}

// 3) Create Checkout Session (prices are **already in cents**)
export async function checkoutAction(formData: FormData): Promise<void> {
  const raw = formData.get('items');
  if (!raw) throw new Error('No items submitted.');

  let items: Array<{ name: string; price: number; quantity?: number; images?: string[] }>;
  try {
    items = JSON.parse(String(raw));
  } catch {
    throw new Error('Items payload is not valid JSON.');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Your cart is empty.');
  }

  const line_items = items.map((it, i) => {
    const name =
      typeof it?.name === 'string' && it.name.trim() ? it.name.trim() : `Item ${i + 1}`;
    // 🔧 price is already in cents in your store data — DO NOT multiply by 100
    const unit_amount = Math.round(Number(it?.price)); // cents
    if (!Number.isFinite(unit_amount) || unit_amount < 50) {
      throw new Error(`Price for "${name}" must be valid (>= 50 cents).`);
    }
    const quantity = Math.max(1, Math.floor(Number(it?.quantity ?? 1)));
    const images = Array.isArray(it?.images) ? it.images.filter(Boolean) : [];

    return {
      price_data: {
        currency: 'usd',
        product_data: { name, images },
        unit_amount, // cents
      },
      quantity,
    };
  });

  const base = getBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items,
    success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/cart`,
    locale: 'en', // force English
  });

  redirect(session.url!);
}
