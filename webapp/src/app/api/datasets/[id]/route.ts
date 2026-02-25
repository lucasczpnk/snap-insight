import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Dataset ID required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: dataset, error: datasetError } = await admin
    .from("datasets")
    .select("*")
    .eq("id", id)
    .single();

  if (datasetError || !dataset) {
    return NextResponse.json(
      { error: "Dataset not found or expired" },
      { status: 404 }
    );
  }

  if (dataset.upload_status !== "ready") {
    return NextResponse.json(
      { error: "Dataset is still processing" },
      { status: 202 }
    );
  }

  const { data: columns } = await admin
    .from("dataset_columns")
    .select(`
      id,
      name,
      ordinal_position,
      inferred_type,
      nullable,
      distinct_count,
      null_count,
      is_primary_key_candidate,
      is_categorical_candidate,
      column_statistics (
        min_numeric,
        max_numeric,
        avg_numeric,
        median_numeric,
        min_datetime,
        max_datetime,
        uniqueness_ratio
      ),
      column_samples (sample_value)
    `)
    .eq("dataset_id", id)
    .order("ordinal_position");

  const { data: profile } = await admin
    .from("dataset_profiles")
    .select("*")
    .eq("dataset_id", id)
    .single();

  const columnsWithSamples = (columns || []).map((col: Record<string, unknown>) => {
    const stats = Array.isArray(col.column_statistics)
      ? col.column_statistics[0]
      : col.column_statistics;
    const samples = Array.isArray(col.column_samples)
      ? (col.column_samples as { sample_value: string }[]).map((s) => s.sample_value)
      : [];
    return {
      id: col.id,
      name: col.name,
      ordinal_position: col.ordinal_position,
      inferred_type: col.inferred_type,
      nullable: col.nullable,
      distinct_count: col.distinct_count,
      null_count: col.null_count,
      is_primary_key_candidate: col.is_primary_key_candidate,
      is_categorical_candidate: col.is_categorical_candidate,
      statistics: stats,
      samples,
    };
  });

  return NextResponse.json({
    dataset: {
      id: dataset.id,
      name: dataset.name,
      row_count: dataset.row_count,
      column_count: dataset.column_count,
      upload_status: dataset.upload_status,
      expires_at: dataset.expires_at,
    },
    columns: columnsWithSamples,
    profile: profile || null,
  });
}
