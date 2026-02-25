-- Seed a demo dataset from sample.csv for README share link verification.
-- Run after 00001_initial_schema.sql. Creates /report/00000000-0000-4000-8000-000000000001
-- Idempotent: skips if demo dataset already exists.

do $$
begin
  if not exists (select 1 from datasets where id = '00000000-0000-4000-8000-000000000001') then
    insert into sessions (id, expires_at)
    values ('00000000-0000-4000-8000-000000000010', now() + interval '1 year')
    on conflict (id) do nothing;

    insert into datasets (id, session_id, name, file_size, row_count, column_count, upload_status, expires_at, processed_at)
values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000010',
  'snap-insight-sample.csv',
  256,
  10,
  5,
  'ready',
  now() + interval '1 year',
  now()
);

    insert into dataset_columns (id, dataset_id, name, ordinal_position, inferred_type, nullable, distinct_count, null_count, is_primary_key_candidate, is_categorical_candidate)
values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'id', 1, 'integer', false, 10, 0, true, false),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', 'user_id', 2, 'integer', false, 4, 0, false, false),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000001', 'category', 3, 'categorical', false, 3, 0, false, true),
  ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000001', 'amount', 4, 'float', false, 10, 0, false, false),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000001', 'created_at', 5, 'datetime', false, 10, 0, false, false);

    insert into column_statistics (column_id, min_numeric, max_numeric, avg_numeric, median_numeric, min_datetime, max_datetime)
values
  ('00000000-0000-4000-8000-000000000011', 1, 10, 5.5, 5.5, null, null),
  ('00000000-0000-4000-8000-000000000012', 101, 104, 102.5, 102.5, null, null),
  ('00000000-0000-4000-8000-000000000014', 14.99, 349.99, 105.00, 77.25, null, null),
  ('00000000-0000-4000-8000-000000000015', null, null, null, null, '2024-01-15', '2024-01-24');

    insert into column_samples (column_id, sample_value)
values
  ('00000000-0000-4000-8000-000000000011', '1'), ('00000000-0000-4000-8000-000000000011', '2'), ('00000000-0000-4000-8000-000000000011', '3'),
  ('00000000-0000-4000-8000-000000000012', '101'), ('00000000-0000-4000-8000-000000000012', '102'), ('00000000-0000-4000-8000-000000000012', '103'),
  ('00000000-0000-4000-8000-000000000013', 'Electronics'), ('00000000-0000-4000-8000-000000000013', 'Clothing'), ('00000000-0000-4000-8000-000000000013', 'Books'),
  ('00000000-0000-4000-8000-000000000014', '99.50'), ('00000000-0000-4000-8000-000000000014', '45.00'), ('00000000-0000-4000-8000-000000000014', '199.00'),
  ('00000000-0000-4000-8000-000000000015', '2024-01-15'), ('00000000-0000-4000-8000-000000000015', '2024-01-16'), ('00000000-0000-4000-8000-000000000015', '2024-01-17');

    insert into dataset_profiles (dataset_id, probable_primary_keys, categorical_columns, datetime_columns, numeric_columns, detected_relationships, quality_score)
    values ('00000000-0000-4000-8000-000000000001', 1, 1, 1, 3, 1, 80);

    insert into inferred_relationships (dataset_id, source_column_id, target_column_id, relationship_type, confidence_score, overlap_ratio)
    values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000011', 'possible_foreign_key', 0.85, null);
  end if;
end $$;
