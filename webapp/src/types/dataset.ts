export interface ColumnMetadata {
  name: string;
  type: "string" | "number" | "date" | "boolean" | "categorical";
  nullCount: number;
  uniqueCount: number;
  min?: number | string;
  max?: number | string;
  samples: string[];
  isPrimaryKeyCandidate?: boolean;
  isCategoricalCandidate?: boolean;
}

export interface DatasetInfo {
  id?: string;
  name: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnMetadata[];
}
