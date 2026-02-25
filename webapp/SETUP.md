# Snap Insight — Setup Guide

This guide lists all environment variables, config files, and Supabase dashboard settings needed for auth and upload to work.

---

## Environment Variables

| Variable | Required | Used By | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Client + Server | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client + Server | Supabase anonymous/public key for client-side auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server only | Service role key for API routes (upload, datasets) |

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
- **Run:** `supabase/migrations/00001_initial_schema.sql`

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
