# Dataset Intelligence SaaS — Implementation Blueprint

# 1. Concept & Core Promise Definition

## Product Name (working)

**Snap Insight** (placeholder)

## Core Concept

A web-based SaaS that allows users to **upload a CSV dataset and instantly understand it** through:

1. **Automatic dataset documentation (Schema Explorer)**
2. **Instant visual dashboards (Auto Dashboard)**

The system transforms raw tabular data into structured insights without requiring SQL, BI tools, or manual configuration.

---

## Core Promise

> "Upload data → instantly understand structure, quality, and insights."

The product eliminates the typical friction between receiving a dataset and being able to interpret it.

Instead of building dashboards manually, users receive:

- automatic structural understanding
- automatic exploratory analytics
- shareable outputs

---

## Target Users

Primary:

- data analysts
- developers
- startup operators
- students/researchers
- freelancers working with exports

Secondary:

- non-technical users receiving CSV exports from tools (Stripe, Shopify, analytics platforms)

---

## Problem Statement

Users frequently receive datasets but must:

- inspect columns manually
- guess data types
- write queries
- configure dashboards

This creates onboarding friction before insights can be extracted.

The product compresses this process into a single interaction.

---

## Core Product Philosophy

The system is **opinionated**, not customizable.

Users do NOT build dashboards.
The system generates insights automatically.

This constraint is intentional and critical for execution success.

---

# 2. Functionality & Product Goals

## Primary Workflow

```
Upload CSV
↓
Automatic Analysis
↓
Overview (Schema Explorer)
↓
Insights (Dashboard Visualizer)
↓
Share / Export
```

---

## Feature Set (MVP — STRICT)

### 2.0 Billing Tier
Below are implementation-oriented guidelines for integrating Stripe into your SaaS while enforcing the tier constraints you defined. The goal is to keep billing simple, deterministic, and tightly coupled to backend enforcement — not UI logic.

#### 1. Core Billing Design Principles
1. Backend is the source of truth
Limits must never be enforced client-side.
Every upload or dataset access must validate:
```user/session → tier → limits → action allowed?```

#### 2. Stripe controls entitlement, not behavior

Stripe answers only:
> “Is this user paid?”

Your application determines:
- file limits
- retention
- processing permissions
- cleanup lifecycle

#### 3. Tier resolution hierarchy

When a request arrives:
```
IF authenticated:
    check Stripe subscription status
ELSE:
    anonymous free tier
```
Never infer paid access from frontend state.

#### 2. Tier Definitions (Canonical Source)

Create a single backend configuration object.
```
export const TIERS = {
  free_anon: {
    maxFileSizeMB: 10,
    maxRows: 100_000,
    retentionHours: 0.25 // 15 minutes
  },
  free_auth: {
    maxFileSizeMB: 10,
    maxRows: 100_000,
    retentionHours: 24
  },
  paid: {
    maxFileSizeMB: 35,
    maxRows: 300_000,
    retentionHours: 24 * 30
  }
};
```
This must be reused everywhere:
- upload validation
- processing workers
- cleanup cron
- UI display

#### 3. Database Additions (Billing Layer)
##### users table extension (Supabase auth.users mirror)
Create a profile table:
```
create table user_profiles (
    id uuid primary key references auth.users(id) on delete cascade,

    stripe_customer_id text,
    subscription_status text,
    subscription_tier text,

    current_period_end timestamptz,
    created_at timestamptz default now()
);
```

##### subscription_status values
```
inactive
trialing
active
past_due
canceled
```
Only `active` or `trialing` unlock paid tier.

#### 4. Stripe Product Structure (Keep Minimal)

You only need:
- Product
```Dataset SaaS Pro```
- Price
```Monthly subscription```
Avoid multiple prices initially — complexity grows quickly.

#### 5. Stripe Flow Architecture
##### Step 1 — User clicks Upgrade
- Frontend calls:
```POST /api/billing/create-checkout-session```

Server:
- verifies authenticated user
- creates Stripe customer (if missing)
- creates Checkout Session

- Checkout Session Example
```
stripe.checkout.sessions.create({
  customer: stripeCustomerId,
  mode: "subscription",
  line_items: [
    {
      price: STRIPE_PRICE_ID,
      quantity: 1
    }
  ],
  success_url: `${APP_URL}/billing/success`,
  cancel_url: `${APP_URL}/billing`
});
```

##### Step 2 — Stripe Webhook (Critical)

Create endpoint:
```/api/stripe/webhook```

Listen for:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

- Webhook Responsibility
Update:
```
user_profiles.subscription_status
user_profiles.subscription_tier
current_period_end
```
Never update subscription state from frontend redirects.

#### 6. Tier Resolution Logic (Backend)

Central helper:
```
async function resolveUserTier(userId?: string) {
  if (!userId) return "free_anon";

  const profile = await getProfile(userId);

  if (profile.subscription_status === "active")
    return "paid";

  return "free_auth";
}
```
All APIs must call this.

#### 7. Upload Enforcement (MOST IMPORTANT)
Before upload begins:
- Validate:
    - file size
    - estimated row count
    - tier eligibility

Example:
```
if (fileSizeMB > tier.maxFileSizeMB)
   throw new Error("File exceeds tier limit");
```

##### Row Count Strategy

Do NOT fully parse CSV first.
Instead:
- sample first ~1MB
- estimate rows
- reject early

This prevents compute abuse.

#### 8. Retention Enforcement
Retention should be calculated at dataset creation.
- Add to datasets table:
```
alter table datasets
add column expires_at timestamptz;
```
- During creation:
```
expires_at = now() + tier.retentionHours
```

##### Cleanup Worker (Cron Job)

Runs every 15 minutes:
```
delete from datasets
where expires_at < now();
```
Cascade deletes everything.
This is where Stripe tiers materially affect system behavior.

#### 9. Anonymous → Auth Upgrade Behavior (Important UX Win)
When a user signs up:
Do NOT migrate datasets automatically.

Instead:
- keep anonymous datasets temporary
- encourage re-upload after signup
- Migration logic adds large complexity.

#### 10. UI Billing Guidelines
UI should only display limits, never enforce them.
Show clearly:
| Tier | File | Rows | Retention |
| ---- | ---- | ---- | --------- |
| Free | 10MB | 100k | 15m / 24h |
| Pro  | 35MB | 300k | 30d       |

Key UX rule:
Always explain WHY upload failed:
```
"This file exceeds the Free tier limit (10MB).
Upgrade to Pro to upload up to 35MB."
```

#### 11. Abuse Prevention (Very Relevant for Hackathon)
Add:
- Dataset creation rate limit

Example:
```
anonymous: 5 uploads/hour
authenticated: 20/hour
paid: 100/hour
```
Store counters per session/user.

#### 12. Common Implementation Traps
- ❌ Checking Stripe API on every request
Too slow and rate-limited.
Use webhook-synced database state.

- ❌ Encoding limits in frontend
Users will bypass instantly.

- ❌ Multiple subscription tiers initially
You don’t need them yet.

- ❌ Unlimited storage assumption
Retention limits must delete storage objects too.

- Make sure to remove:
- DB rows
- Supabase storage files

#### 13. Minimal Implementation Order (Recommended)
1. Implement tier config constants
2. Add user_profiles
3. Build webhook handler
4. Resolve tier helper
5. Upload validation
6. Retention expiration cron
7. Upgrade UI
Stripe should come after core upload works.

### 2.1 Dataset Upload
- CSV file upload only
- File size limit: 10 MB (larger files as paid option)
- Immediate validation
- Dataset stored with metadata

---

### 2.2 Schema Explorer (Tab 1)

Automatically generated dataset documentation.

#### Column Analysis
- inferred data type:
  - numeric
  - categorical
  - datetime
  - text
- null percentage
- unique values count
- min/max (numeric/date)
- sample values

#### Dataset Summary
- total rows
- total columns
- missing data overview
- inferred dataset "shape"

#### Column Distribution Preview
- numeric → histogram
- categorical → top values

---

### 2.3 Auto Dashboard (Tab 2)

Automatically generated visual insights.

Charts generated via heuristics:

| Data Type | Visualization |
|---|---|
| datetime + numeric | line chart |
| categorical + numeric | bar chart |
| categorical counts | pie/bar |
| numeric | distribution chart |

Rules must be deterministic.
NO manual chart builder.

---

### 2.4 Shareable View
- public read-only link
- dashboard + schema accessible
- no editing

---

## Explicit Non-Goals (Hard Constraints)

The system MUST NOT include:
- manual dashboard editing
- SQL querying
- dataset joins
- real-time updates
- database integrations
- Excel/Google Sheets imports (anti MVP)
- authentication complexity beyond basic login
- collaborative editing

---

# 3. UI / UX Definitions & Flows

## UX Principles

1. Immediate feedback
2. Zero configuration
3. Progressive disclosure
4. Read-first interface (insight consumption)

---

## Primary Screens

### 3.1 Landing Page / Hero section
Goal: communicate transformation quickly.

Sections:
- upload CTA above the fold
- example transformation preview
- “Upload → Understand → Share” explanation

---

### 3.2 Upload State

Drag-and-drop zone / Upload button.

States:
- empty
- uploading
- processing
- error handling

Processing must feel fast (<5s target).

---

### 3.3 Dataset Workspace

Top navigation:
[ Overview ] [ Insights ]

---

### Overview Tab (Schema Explorer)

Layout:
- dataset summary header
- column table
- expandable column detail panels

Focus:
clarity over density.

---

### Insights Tab (Dashboard)

Layout:
- responsive card grid
- auto-generated charts
- minimal controls
Charts must feel curated, not configurable.

---

### 3.4 Share View

Read-only version:
- no editing UI
- clean presentation
- optimized for demonstration

---

## UX Success Criteria

A first-time user should:
- upload data
- understand dataset structure
- see meaningful charts

within **60 seconds**.

---

# 4. Implementation Constraints & Risk Management

## Core Architecture

Stack:
- Next.js (frontend + API routes)
- Tailwind (instead of CSS)
- Supabase (auth + storage + metadata DB) + Postgres
- Vercel (for deployment)
- auth options for github and google
- Stripe (for the payment options)

---

## Processing Pipeline

```
CSV Upload
↓
Parse → DataFrame
↓
Column Type Inference
↓
Statistics Computation
↓
Chart Heuristic Engine
↓
Store metadata JSON
```

Schema + dashboards derived from same analysis step.

---

## Functional Detailing

### 1. Shared Foundations (Applies to Both Pages)
Before separating pages, define shared behavior.

### 1.1 Data Input Layer
Supported inputs:
- CSV upload
- Drag-and-drop file area
- Optional: paste CSV text
- Optional (stretch): public CSV URL

### 1.2 Required Processing Steps

#### 1. File validation
- Size limit (ex: 10–25MB)
- Encoding normalization (UTF-8 fallback)
- Header detection

#### 2. Type inference per column:
- string
- integer
- float
- boolean
- datetime
- categorical (low cardinality string)

#### 3. Profiling metadata generation:
- null count
- unique count
- min/max (numeric/date)
- sample values
- inferred relationships (heuristic)

#### 4. Output storage
Output should be stored as:
```
dataset
 ├── raw_preview_rows
 ├── column_metadata[array]
 ├── inferred_relationships[array]
 └── statistics[array]
 ```
These shared objects powers both tabs

### 1.3 Dataset Session Model
User does NOT need authentication (while under the free usage constraints).

Session model:
- dataset stored temporarily
- shareable link (optional stretch)
- expires after 24 hours

Key rule:
> Never recompute profiling unless dataset changes.

---

### 2. Schema Explorer Page (Structure Understanding)

Core Objective

Help users quickly understand how columns relate and how data could be modeled.
This page should feel closer to an engineering tool than analytics software.

### 2.1 Functional Goals

The page must allow users to:
1. See column types instantly
2. Detect potential primary keys
3. Detect relationships between columns
4. Identify normalization opportunities
5. Understand data quality issues structurally

---

### 2.2 Main Components
#### A. Schema Graph View (Primary Feature)

Visual representation:

Nodes:
- Columns (or grouped entities)

Edges:
- Possible relationships inferred via:
    - identical value sets
    - foreign-key-like overlap
    - naming similarity (user_id, customer_id)

Edge confidence scoring:

```
High → value overlap > 90%
Medium → overlap 50–90%
Low → naming heuristic only
```

UX rules:
- Default simplified layout
- Avoid overwhelming graphs
- Cluster automatically

Controls:
- zoom/pan
- toggle relationship confidence
- group by inferred entity

---

#### B. Column Inspector Panel

Clicking a column opens:
- detected type
- null %
- unique %
- example values
- warnings:
    - high null rate
    - mixed types
    - likely ID column (decision made by naming conventions - i.e. column with id in name / id-like structured data)
    - categorical candidate
    - Goal: replace manual spreadsheet inspection.

---

#### C. Schema Summary Panel

Auto-generated summary:
Example:
```
Detected:
• 1 probable primary key
• 3 categorical dimensions
• 2 timestamp fields
• 1 potential foreign key relationship
```

This gives immediate comprehension.

---

#### D. Data Quality Flags

Automatically highlight:
- duplicate candidate keys
- columns with inconsistent typing
- extremely sparse columns
- high cardinality strings
- These are structural signals, not analytics.

---

### 2.3 UX Flow — Schema Page
```
Upload →
Auto-processing loader →
Schema graph appears →
User explores nodes →
Clicks column →
Reads structural insights
```
No configuration required initially.

---

### 3. CSV Dashboard Page (Data Understanding)
Core Objective
Allow fast exploratory analysis without building dashboards manually.
This page should feel analytical but lightweight.

### 3.1 Functional Goals

User should be able to:
- Understand distributions quickly
- Detect anomalies
- Compare categories
- View summary metrics instantly
- Explore without configuration friction

### 3.2 Automatic Dashboard Generation

Upon loading:
System auto-builds dashboard sections based on column types.

#### Numeric Columns → Metrics + Distribution
Auto-create:
- mean
- median
- min/max
- histogram

#### Categorical Columns → Frequency Charts
Auto-create:
- top values bar chart
- cardinality indicator
- rare category detection

#### Datetime Columns → Time Series
Auto-create:
- count over time
- trend visualization

### 3.3 Smart Chart Selection Rules

This is important differentiation.

| Column Type |	Chart |
|---|---|
| numeric | histogram |
| categorical | bar chart |
| datetime | line chart |
| boolean | ratio chart |

No manual chart picking initially.

### 3.4 Interactive Filtering (Critical Feature)

Global filter panel:
- filter by column value
- range sliders for numeric
- multi-select for categories
All charts react instantly.

This creates perceived sophistication with minimal complexity.

### 3.5 Column Detail Drilldown

Clicking a chart opens:
- deeper statistics
- correlation hints
- example rows

### 3.6 UX Flow — Dashboard Page
```
Upload →
Dashboard auto-generated →
User scans metrics →
Applies filters →
Investigates anomalies →
Drilldowns into columns
```
Zero configuration onboarding is essential.

### 4. Cross-Page Interaction Rules
The two tabs must feel connected.

#### Navigation Behavior
Switching tabs:
- preserves filters
- preserves selected column
- no reload

Example:
User inspects `user_id` relationships → switches to dashboard → sees metrics filtered by that column context.

#### Shared Column Identity
Columns must have consistent:
- color
- icon
- type indicator

This builds cognitive continuity.

### 5. Implementation Guidelines (Practical)
Frontend Structure:
```
/app
  /upload
  /workspace
      /schema
      /dashboard
/components
/lib/data-profiler
```

#### Suggested Component Model
Shared:
- DatasetProvider (React context)
- ColumnMetadata store
- FilterState store

Schema Page:
- GraphCanvas
- ColumnInspector
- SchemaSummary

Dashboard Page:
- AutoChartRenderer
- MetricsPanel
- FilterSidebar

#### Performance Rules

- Only profile first N rows (ex: 50k)
- Lazy render charts
- Virtualize tables
- Cache computed stats

### 6. Database Design Principles

Before tables, these constraints guide the model:

1. Datasets are the root entity
Everything attaches to one uploaded dataset.

2. Profiling results are persisted
Schema Explorer and Dashboard must read precomputed metadata.

3. Raw data ≠ analytics metadata
Separate storage prevents heavy queries.

4. Session-scoped lifecycle
Data can expire safely.

5. Column-centric architecture
Most features operate per column.

#### Entity Relationship Overview
```
sessions
   └── datasets
          ├── dataset_columns
          │       ├── column_statistics
          │       └── column_samples
          ├── inferred_relationships
          ├── dataset_profiles
          └── dataset_rows (optional / preview only)
```

#### 1. sessions

Represents anonymous usage without authentication.
Anonymous usage expiry limit is 15m.
```
create table sessions (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    expires_at timestamptz not null,
    ip_hash text,
    user_agent text
);
```
Purpose: 
- dataset ownership
- cleanup lifecycle
- optional sharing links later

#### 2. datasets (Core Entity)

Each upload creates one dataset.
```
create table datasets (
    id uuid primary key default gen_random_uuid(),
    session_id uuid references sessions(id) on delete cascade,

    name text,
    file_size bigint,
    row_count integer,
    column_count integer,

    upload_status text check (
        upload_status in ('processing','ready','failed')
    ) default 'processing',

    storage_path text, -- Supabase storage reference
    created_at timestamptz default now(),
    processed_at timestamptz
);
```
Notes
- `upload_status` allows async processing.
- `storage_path` points to raw CSV in Supabase Storage.

#### 3. dataset_columns (Central Table)

Most application logic reads from here.
```
create table dataset_columns (
    id uuid primary key default gen_random_uuid(),
    dataset_id uuid references datasets(id) on delete cascade,

    name text not null,
    ordinal_position integer,

    inferred_type text check (
        inferred_type in (
            'string',
            'integer',
            'float',
            'boolean',
            'datetime',
            'categorical'
        )
    ),

    nullable boolean,
    distinct_count integer,
    null_count integer,

    is_primary_key_candidate boolean default false,
    is_categorical_candidate boolean default false,

    created_at timestamptz default now()
);
```
*Why this matters*
Both pages rely heavily on column metadata:
- Schema graph nodes
- Dashboard auto chart generation

#### 4. column_statistics

Precomputed analytical values.
```
create table column_statistics (
    column_id uuid primary key
        references dataset_columns(id) on delete cascade,

    min_numeric double precision,
    max_numeric double precision,
    avg_numeric double precision,
    median_numeric double precision,

    min_datetime timestamptz,
    max_datetime timestamptz,

    entropy_score double precision,
    uniqueness_ratio double precision,

    updated_at timestamptz default now()
);
```
Used by
- histograms
- anomaly hints
- schema insights
- summary panels

#### 5. column_samples

Small sample values for UI inspection.
```
create table column_samples (
    id bigserial primary key,
    column_id uuid references dataset_columns(id) on delete cascade,
    sample_value text
);
```
Store 30 examples per column.

Reason:
Avoid scanning raw CSV repeatedly.

#### 6. inferred_relationships (Schema Explorer Core)

Drives graph visualization.
```
create table inferred_relationships (
    id uuid primary key default gen_random_uuid(),

    dataset_id uuid references datasets(id) on delete cascade,

    source_column_id uuid references dataset_columns(id),
    target_column_id uuid references dataset_columns(id),

    relationship_type text check (
        relationship_type in (
            'possible_foreign_key',
            'value_overlap',
            'naming_similarity'
        )
    ),

    confidence_score numeric(5,2),
    overlap_ratio numeric(5,2),

    created_at timestamptz default now()
);
```
Used for
- graph edges
- confidence coloring
- schema summary generation

#### 7. dataset_profiles (Dataset-Level Summary)

Aggregated insights shown at top-level UI.
```
create table dataset_profiles (
    dataset_id uuid primary key
        references datasets(id) on delete cascade,

    probable_primary_keys integer,
    categorical_columns integer,
    datetime_columns integer,
    numeric_columns integer,

    detected_relationships integer,
    quality_score numeric(5,2),

    generated_at timestamptz default now()
);
```
This avoids recomputing summaries on every page load.

#### Indexing Strategy (Important)
```
create index idx_columns_dataset
on dataset_columns(dataset_id);

create index idx_relationships_dataset
on inferred_relationships(dataset_id);

create index idx_rows_dataset
on dataset_rows(dataset_id);

create index idx_samples_column
on column_samples(column_id);
```

#### Lifecycle / Cleanup Strategy

Since this is session-based:
```
delete from sessions
where expires_at < now();
```
Cascade deletes everything automatically.

Recommended TTL:
> 24 hours for paid users / 15m for anonymous users

#### Query Flow Mapping to UI
Schema Explorer Loads
```
datasets
 → dataset_columns
 → column_statistics
 → inferred_relationships
 → dataset_profiles
```
Single aggregated fetch.

#### Dashboard Loads
```
dataset_columns
 → column_statistics
 → dataset_rows (preview)
```
Charts generated client-side.

---

## Data Model (Simplified)

```
users
datasets
dataset_metadata (JSON stats)
generated_charts
```


---

## Performance Constraints

- max rows recommended: ~100k (can be supersized with paid option)
- synchronous processing only
- no background workers (MVP)

---

## Critical Anti-Patterns (DO NOT IMPLEMENT)

### ❌ Mini BI Tool Trap
Adding:
- filters
- custom aggregations
- chart editors

Destroys execution speed.

---

### ❌ Infinite File Support
Large datasets introduce:
- memory issues
- serverless timeouts

Hard limit required.

---

### ❌ Over-Automation via AI
LLMs introduce:
- unpredictability
- slower responses
- demo instability

Keep deterministic logic.

---

### ❌ Multi-Source Integrations
APIs and connectors massively expand scope.

Stay CSV-only initially.

---

## Operational Risks

| Risk | Mitigation |
|---|---|
| malformed CSV | strict parser validation |
| slow processing | file size limits |
| incorrect type inference | deterministic fallback rules |

---

# 5. Differentiation Reasoning (Implementation Compass)

This section defines *why this product wins in a hackathon* and should guide decisions.

---

## Core Differentiation

Not:
- a dashboard builder
- a data validator
- a BI tool

But:

> **Instant Data Understanding Platform**

---

## Key Experience to Optimize

The emotional moment:

> User uploads unknown dataset → instantly understands it.

Every implementation decision should reinforce this transformation.

---

## Differentiation Pillars

### 1. Opinionated Automation
Remove decisions from users.
Automation = product identity.

---

### 2. Immediate Visual Payoff
Charts appear automatically.
No configuration friction.

---

### 3. Cohesive Workflow
Schema → Insights is a narrative journey.

Do not separate into unrelated tools.

---

### 4. Perceived Completeness
Small feature set executed perfectly beats wide scope.

Focus on:
- loading states
- empty states
- polished typography
- consistent spacing
- responsive layout

---

## Implementation North Star

If a feature answers:
> “Does this help users understand data instantly?”

→ include.

If not:
→ reject.

---

# Final Guiding Principle

Build a **small product that feels finished**, not a large product that feels incomplete.

The goal is not technical breadth, but a convincing, reliable, and polished transformation experience.