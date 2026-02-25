# Snap Insight — Setup Guide

This guide lists all environment variables, config files, and Supabase dashboard settings needed for auth and upload to work.

---

## Environment Variables

| Variable | Required | Used By | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Client + Server | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client + Server | Supabase anonymous/public key for client-side auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server only | Service role key for API routes (upload, datasets) |
| `STRIPE_SECRET_KEY` | No | Server only | Stripe secret key for Pro checkout (get from [Stripe Dashboard](https://dashboard.stripe.com/apikeys)) |
| `STRIPE_PRICE_ID_PRO` | No | Server only | Stripe Price ID for Pro plan (create product/price at [Stripe Products](https://dashboard.stripe.com/products)) |
| `STRIPE_WEBHOOK_SECRET` | No | Server only | Webhook signing secret (from Stripe CLI for localhost, or Dashboard → Webhooks for production) |

**File:** `.env.local` (create from `.env.example`)

---

## Files That Use Env Variables

| File | Variables Used |
|------|----------------|
| `src/lib/supabase/client.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `src/lib/supabase/server.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `src/lib/supabase/admin.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `src/app/api/upload/route.ts` | Uses admin client → needs `SUPABASE_SERVICE_ROLE_KEY` |
| `src/app/api/datasets/[id]/route.ts` | Uses admin client → needs `SUPABASE_SERVICE_ROLE_KEY` |
| `src/app/api/stripe/checkout/route.ts` | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_PRO` |
| `src/app/api/stripe/webhook/route.ts` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `src/app/auth/callback/route.ts` | Uses server client → needs URL + anon key |

---

## Supabase Dashboard Configuration

### 1. Project URL & Keys
- **Location:** [Project Settings → API](https://supabase.com/dashboard/project/_/settings/api)
- **Copy:** Project URL, `anon` key, `service_role` key
- **Supabase values**: 

### 2. Storage Bucket (for CSV uploads)
- **Location:** Storage → Create bucket
- **Bucket name:** `uploads`
- **Public:** Optional (API uses service role for access)

### 3. Database Schema
- **Location:** SQL Editor
- **Run (in order):**
  1. `supabase/migrations/00001_initial_schema.sql`
  2. `supabase/migrations/00002_seed_demo_dataset.sql` — seeds sample report for share link: `/report/00000000-0000-4000-8000-000000000001`

### 4. OAuth Providers
- **Location:** [Authentication → Providers](https://supabase.com/dashboard/project/_/auth/providers)
- **GitHub:** Enable, add Client ID + Secret from [GitHub OAuth Apps](https://github.com/settings/developers)
- **Google:** Enable, add Client ID + Secret from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

### 5. Redirect URLs
- **Location:** [Authentication → URL Configuration](https://supabase.com/dashboard/project/_/auth/url-configuration)
- **Site URL:** `http://localhost:3000` (dev) or your production URL
- **Redirect URLs:** Add:
  - `http://localhost:3000/auth/callback`
  - `https://yourdomain.com/auth/callback` (production)

---

## Stripe (Optional — Pro Subscription)

- **Location:** [Stripe Dashboard](https://dashboard.stripe.com)
- **API Key:** Dashboard → Developers → API keys → Secret key (`sk_test_...` for test mode)
- **Price:** Create a Product (e.g. "Snap Insight Pro") and a recurring Price ($19/month), copy the Price ID (`price_...`)
- Add `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID_PRO` to `.env.local`
- Without these, "Upgrade Now" will show "Upgrade is not configured yet."

### Webhooks (Optional — for subscription sync)

**Localhost testing:**
1. Install [Stripe CLI](https://stripe.com/docs/stripe-cli)
2. Run: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
3. Stripe CLI prints a webhook signing secret (`whsec_...`). Add to `.env.local` as `STRIPE_WEBHOOK_SECRET`

**Production:**
1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. **Endpoint URL:** `https://yourdomain.com/api/stripe/webhook` (replace `yourdomain.com` with your deployed domain, e.g. `snap-insight.vercel.app`)
3. **Events to send:** `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy the **Signing secret** (`whsec_...`) and add to your production env as `STRIPE_WEBHOOK_SECRET`

---

## Shareable Reports

- After a successful upload, the **Copy report link** button creates a shareable URL: `/report/[datasetId]`
- Reports are **publicly accessible** — no auth required. Anyone with the link can view the schema explorer and auto dashboard.
- Works for both free- and paid-tier datasets. The `/api/datasets/[id]` route does not require authentication.

---

## Quick Start

```bash
# 1. Copy env template
cp .env.example .env.local

# 2. Edit .env.local with your Supabase values
# (Get from Supabase Dashboard → Project Settings → API)

# 3. Create Storage bucket "uploads" in Supabase
# 4. Run migration 00001_initial_schema.sql in Supabase SQL Editor
# 5. Enable GitHub/Google in Auth → Providers and add redirect URLs

npm run dev
```
