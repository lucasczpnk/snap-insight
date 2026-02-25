-- Snap Insight: initial schema (sessions, datasets, columns, profiles)
-- Run this in Supabase SQL Editor or via Supabase CLI.

-- 1. Sessions (anonymous or linked to user)
create table if not exists sessions (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    expires_at timestamptz not null,
    ip_hash text,
    user_agent text,
    user_id uuid references auth.users(id) on delete set null
);

-- 2. User profiles (billing / Stripe; mirror auth.users)
create table if not exists user_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    stripe_customer_id text,
    subscription_status text,
    subscription_tier text,
    current_period_end timestamptz,
    created_at timestamptz default now()
);

-- 3. Datasets (core entity)
create table if not exists datasets (
    id uuid primary key default gen_random_uuid(),
    session_id uuid references sessions(id) on delete cascade,
    name text,
    file_size bigint,
    row_count integer,
    column_count integer,
    upload_status text check (upload_status in ('processing','ready','failed')) default 'processing',
    storage_path text,
    expires_at timestamptz,
    created_at timestamptz default now(),
    processed_at timestamptz
);

-- 4. Dataset columns
create table if not exists dataset_columns (
    id uuid primary key default gen_random_uuid(),
    dataset_id uuid references datasets(id) on delete cascade not null,
    name text not null,
    ordinal_position integer,
    inferred_type text check (inferred_type in (
        'string','integer','float','boolean','datetime','categorical'
    )),
    nullable boolean,
    distinct_count integer,
    null_count integer,
    is_primary_key_candidate boolean default false,
    is_categorical_candidate boolean default false,
    created_at timestamptz default now()
);

create index if not exists idx_columns_dataset on dataset_columns(dataset_id);

-- 5. Column statistics
create table if not exists column_statistics (
    column_id uuid primary key references dataset_columns(id) on delete cascade,
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

-- 6. Column samples (for UI)
create table if not exists column_samples (
    id bigserial primary key,
    column_id uuid references dataset_columns(id) on delete cascade not null,
    sample_value text
);

create index if not exists idx_samples_column on column_samples(column_id);

-- 7. Inferred relationships (schema graph)
create table if not exists inferred_relationships (
    id uuid primary key default gen_random_uuid(),
    dataset_id uuid references datasets(id) on delete cascade not null,
    source_column_id uuid references dataset_columns(id),
    target_column_id uuid references dataset_columns(id),
    relationship_type text check (relationship_type in (
        'possible_foreign_key','value_overlap','naming_similarity'
    )),
    confidence_score numeric(5,2),
    overlap_ratio numeric(5,2),
    created_at timestamptz default now()
);

create index if not exists idx_relationships_dataset on inferred_relationships(dataset_id);

-- 8. Dataset-level profile summary
create table if not exists dataset_profiles (
    dataset_id uuid primary key references datasets(id) on delete cascade,
    probable_primary_keys integer,
    categorical_columns integer,
    datetime_columns integer,
    numeric_columns integer,
    detected_relationships integer,
    quality_score numeric(5,2),
    generated_at timestamptz default now()
);

-- Optional: dataset_rows for preview (guidelines say optional)
-- create table if not exists dataset_rows (
--     id bigserial primary key,
--     dataset_id uuid references datasets(id) on delete cascade not null,
--     row_index integer,
--     data jsonb
-- );
-- create index if not exists idx_rows_dataset on dataset_rows(dataset_id);

-- RLS (optional): enable when you want row-level security
-- alter table sessions enable row level security;
-- alter table datasets enable row level security;
-- alter table dataset_columns enable row level security;
-- alter table user_profiles enable row level security;
