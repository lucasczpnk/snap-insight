/**
 * Deterministic type inference and column profiling for CSV data.
 * Used by upload API to populate dataset_columns, column_statistics, column_samples.
 */

export type InferredType =
  | "string"
  | "integer"
  | "float"
  | "boolean"
  | "datetime"
  | "categorical";

export interface ColumnProfile {
  name: string;
  ordinal_position: number;
  inferred_type: InferredType;
  null_count: number;
  distinct_count: number;
  is_primary_key_candidate: boolean;
  is_categorical_candidate: boolean;
  samples: string[];
  min_numeric?: number;
  max_numeric?: number;
  avg_numeric?: number;
  median_numeric?: number;
  min_datetime?: string;
  max_datetime?: string;
}

const MAX_SAMPLES = 30;
const CATEGORICAL_THRESHOLD = 20; // distinct values
const ID_LIKE_NAMES = /_?id$/i;

export function inferType(values: string[]): InferredType {
  const nonNull = values.filter((v) => v != null && String(v).trim() !== "");
  if (nonNull.length === 0) return "string";

  const numeric = nonNull.map(Number).filter((n) => !Number.isNaN(n));
  const asDates = nonNull.filter((v) => !Number.isNaN(Date.parse(v)));
  const asBool = nonNull.filter(
    (v) =>
      /^(true|false|1|0|yes|no)$/i.test(String(v).trim())
  );

  if (asBool.length >= nonNull.length * 0.9) return "boolean";
  if (numeric.length >= nonNull.length * 0.9) {
    const hasDecimal = numeric.some((n) => n % 1 !== 0);
    return hasDecimal ? "float" : "integer";
  }
  if (asDates.length >= nonNull.length * 0.8) return "datetime";
  const distinct = new Set(nonNull).size;
  if (distinct <= CATEGORICAL_THRESHOLD && nonNull.length > 0)
    return "categorical";
  return "string";
}

export function profileColumns(
  rows: Record<string, string>[],
  headers: string[]
): ColumnProfile[] {
  return headers.map((name, idx) => {
    const values = rows.map((r) => r[name] ?? "").map(String);
    const nonNull = values.filter((v) => v != null && String(v).trim() !== "");
    const nullCount = rows.length - nonNull.length;
    const distinctCount = new Set(nonNull).size;
    const type = inferType(values);

    const samples = [...new Set(nonNull)].slice(0, MAX_SAMPLES);

    let min_numeric: number | undefined;
    let max_numeric: number | undefined;
    let avg_numeric: number | undefined;
    let median_numeric: number | undefined;
    let min_datetime: string | undefined;
    let max_datetime: string | undefined;

    if (type === "integer" || type === "float") {
      const nums = nonNull.map(Number).filter((n) => !Number.isNaN(n));
      if (nums.length) {
        min_numeric = Math.min(...nums);
        max_numeric = Math.max(...nums);
        avg_numeric = nums.reduce((a, b) => a + b, 0) / nums.length;
        const sorted = [...nums].sort((a, b) => a - b);
        median_numeric =
          sorted.length % 2
            ? sorted[Math.floor(sorted.length / 2)]
            : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      }
    }
    if (type === "datetime") {
      const parsed = nonNull
        .map((v) => ({ s: v, t: Date.parse(v) }))
        .filter((x) => !Number.isNaN(x.t));
      if (parsed.length) {
        const sorted = [...parsed].sort((a, b) => a.t - b.t);
        min_datetime = sorted[0].s;
        max_datetime = sorted[sorted.length - 1].s;
      }
    }

    const isIdLike = ID_LIKE_NAMES.test(name);
    const isPrimaryKeyCandidate =
      isIdLike && distinctCount === nonNull.length && nullCount === 0 && nonNull.length > 0;
    const isCategoricalCandidate =
      type === "categorical" || (type === "string" && distinctCount <= CATEGORICAL_THRESHOLD);

    return {
      name,
      ordinal_position: idx + 1,
      inferred_type: type,
      null_count: nullCount,
      distinct_count: distinctCount,
      is_primary_key_candidate: isPrimaryKeyCandidate,
      is_categorical_candidate: isCategoricalCandidate,
      samples,
      min_numeric,
      max_numeric,
      avg_numeric,
      median_numeric,
      min_datetime,
      max_datetime,
    };
  });
}

export function computeDatasetProfile(columns: ColumnProfile[]): {
  probable_primary_keys: number;
  categorical_columns: number;
  datetime_columns: number;
  numeric_columns: number;
  detected_relationships: number;
  quality_score: number;
} {
  const probable_primary_keys = columns.filter((c) => c.is_primary_key_candidate).length;
  const categorical_columns = columns.filter(
    (c) => c.inferred_type === "categorical" || c.is_categorical_candidate
  ).length;
  const datetime_columns = columns.filter((c) => c.inferred_type === "datetime").length;
  const numeric_columns = columns.filter(
    (c) => c.inferred_type === "integer" || c.inferred_type === "float"
  ).length;
  const detected_relationships = 0; // TODO: infer from value overlap
  const totalCols = columns.length;
  const withTypes = columns.filter((c) => c.inferred_type !== "string").length;
  const quality_score = totalCols ? Math.round((withTypes / totalCols) * 100) : 0;
  return {
    probable_primary_keys,
    categorical_columns,
    datetime_columns,
    numeric_columns,
    detected_relationships,
    quality_score,
  };
}
