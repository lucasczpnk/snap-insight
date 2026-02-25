# Snap Insight — Routes Manifest

Quick reference for judges: all Next.js pages, API routes, and key components.

> **Before submission:** Ensure the GitHub repo is **public**. All paths below exist under `webapp/`.

---

## App Tree (`src/app/`)

```
webapp/src/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                 # Landing: upload zone, pricing, workspace
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts         # OAuth code exchange (GitHub/Google)
│   ├── workspace/
│   │   └── [id]/
│   │       └── page.tsx         # Shareable report by dataset ID
│   ├── report/
│   │   └── [id]/
│   │       └── page.tsx         # Alias for workspace (share view)
│   └── api/
│       ├── upload/
│       │   └── route.ts          # POST CSV → storage + profiling
│       ├── datasets/
│       │   └── [id]/
│       │       └── route.ts     # GET dataset metadata
│       ├── tier/
│       │   └── route.ts         # GET current user tier (polling)
│       └── stripe/
│           ├── checkout/
│           │   └── route.ts     # POST → Stripe Checkout URL
│           └── webhook/
│               └── route.ts     # POST Stripe events → user_profiles
│       └── cron/
│           └── cleanup/
│               └── route.ts     # Deletes expired datasets + Storage objects
├── components/
│   └── DatasetWorkspace.tsx     # Schema Explorer + Auto Dashboard tabs
├── lib/
│   ├── supabase/                 # client, server, admin, TIERS
│   ├── data-profiler.ts         # Type inference + column profiling
│   ├── dataset-api.ts           # API response → DatasetInfo mapper
│   └── pending-upload.ts         # IndexedDB storage for retry flow
└── types/
    └── dataset.ts               # ColumnMetadata, DatasetInfo
```

---

## Exact File Paths (match `@/` imports)

| Import | File path |
|--------|-----------|
| `@/components/DatasetWorkspace` | `webapp/src/components/DatasetWorkspace.tsx` |
| `@/lib/supabase/client` | `webapp/src/lib/supabase/client.ts` |
| `@/lib/supabase/server` | `webapp/src/lib/supabase/server.ts` |
| `@/lib/supabase/admin` | `webapp/src/lib/supabase/admin.ts` |
| `@/lib/supabase` | `webapp/src/lib/supabase.ts` |
| `@/lib/data-profiler` | `webapp/src/lib/data-profiler.ts` |
| `@/lib/dataset-api` | `webapp/src/lib/dataset-api.ts` |
| `@/lib/pending-upload` | `webapp/src/lib/pending-upload.ts` |
| `@/types/dataset` | `webapp/src/types/dataset.ts` |

---

## Route Summary

| Path | Type | Purpose |
|------|------|---------|
| `/` | Page | Landing, upload CTA, pricing, workspace (when dataset in state) |
| `/workspace/[id]` | Page | Shareable read-only report |
| `/report/[id]` | Page | Alias for `/workspace/[id]` |
| `/auth/callback` | API | OAuth callback; exchanges code for session |
| `/api/upload` | API | POST CSV; validates tier, stores file, profiles data |
| `/api/datasets/[id]` | API | GET dataset metadata + columns |
| `/api/tier` | API | GET current tier (`free_anon` \| `free_auth` \| `paid`) |
| `/api/stripe/checkout` | API | POST; creates Stripe Checkout Session |
| `/api/stripe/webhook` | API | POST; handles `checkout.session.completed`, `subscription.*` |
| `/api/cron/cleanup` | API | GET; deletes expired datasets + Supabase Storage objects (cron every 15 min) |
