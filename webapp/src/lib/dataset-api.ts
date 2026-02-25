import type { ColumnMetadata, DatasetInfo } from "@/types/dataset";

export function mapApiTypeToUi(apiType: string): ColumnMetadata["type"] {
  if (apiType === "integer" || apiType === "float") return "number";
  if (apiType === "datetime") return "date";
  if (apiType === "boolean" || apiType === "categorical" || apiType === "string")
    return apiType as ColumnMetadata["type"];
  return "string";
}

export function mapApiResponseToDatasetInfo(api: {
  dataset: { id: string; name: string; row_count: number; column_count: number };
  columns: Array<{
    name: string;
    null_count: number;
    distinct_count: number;
    inferred_type: string;
    is_primary_key_candidate?: boolean;
    is_categorical_candidate?: boolean;
    statistics?: { min_numeric?: number; max_numeric?: number; min_datetime?: string; max_datetime?: string };
    samples: string[];
  }>;
  relationships?: Array<{ source: string; target: string; type: string; confidence: number; overlap?: number | null }>;
}): DatasetInfo {
  return {
    id: api.dataset.id,
    name: api.dataset.name,
    rowCount: api.dataset.row_count,
    columnCount: api.dataset.column_count,
    columns: api.columns.map((c) => ({
      name: c.name,
      type: mapApiTypeToUi(c.inferred_type),
      nullCount: c.null_count,
      uniqueCount: c.distinct_count,
      min: c.statistics?.min_numeric ?? c.statistics?.min_datetime,
      max: c.statistics?.max_numeric ?? c.statistics?.max_datetime,
      samples: c.samples ?? [],
      isPrimaryKeyCandidate: c.is_primary_key_candidate ?? false,
      isCategoricalCandidate: c.is_categorical_candidate ?? false,
    })),
    relationships: api.relationships ?? [],
  };
}
