import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TIERS, type Tier } from "@/lib/supabase";
import { profileColumns, computeDatasetProfile } from "@/lib/data-profiler";
import Papa from "papaparse";

const MAX_ROWS_TO_PROFILE = 50_000;
const ROW_ESTIMATE_SAMPLE_BYTES = 1024 * 1024; // 1MB

async function resolveTier(admin: ReturnType<typeof createAdminClient>, userId: string | null): Promise<Tier> {
  if (!userId) return "free_anon";
  const { data: profile } = await admin
    .from("user_profiles")
    .select("subscription_status, current_period_end")
    .eq("id", userId)
    .single();

  if (profile?.subscription_status === "active") {
    const periodEnd = profile.current_period_end ? new Date(profile.current_period_end).getTime() : 0;
    if (periodEnd > Date.now()) return "paid";
  }
  return "free_auth";
}

async function estimateRowCount(file: File): Promise<number> {
  const chunk = file.slice(0, ROW_ESTIMATE_SAMPLE_BYTES);
  const text = await chunk.text();
  const lines = text.split(/\r?\n/).length;
  const bytesPerRow = text.length / Math.max(lines, 1);
  if (bytesPerRow <= 0) return 0;
  return Math.ceil(file.size / bytesPerRow);
}

export async function POST(request: Request) {
  try {
    const admin = createAdminClient();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const tier = await resolveTier(admin, user?.id ?? null);
    const limits = TIERS[tier];

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { error: "Only CSV files are supported" },
        { status: 400 }
      );
    }

    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > limits.maxFileSizeMB) {
      return NextResponse.json(
        {
          error: `File size exceeds your plan limit. Your file is too large for the current tier.`,
          constraint: {
            type: "file_size",
            actual: Math.round(fileSizeMB * 10) / 10,
            limit: limits.maxFileSizeMB,
            unit: "MB",
          },
        },
        { status: 413 }
      );
    }

    const estimatedRows = await estimateRowCount(file);
    if (estimatedRows > limits.maxRows) {
      return NextResponse.json(
        {
          error: `Row count exceeds your plan limit. Your dataset has too many rows for the current tier.`,
          constraint: {
            type: "row_count",
            actual: estimatedRows,
            limit: limits.maxRows,
            unit: "rows",
          },
        },
        { status: 413 }
      );
    }

    const retentionHours = limits.retentionHours;
    const expiresAt = new Date(Date.now() + retentionHours * 60 * 60 * 1000);

    const { data: sessionRow, error: sessionError } = await admin
      .from("sessions")
      .insert({
        expires_at: expiresAt.toISOString(),
        user_id: user?.id ?? null,
      })
      .select("id")
      .single();

    if (sessionError || !sessionRow) {
      console.error("Session create error:", sessionError);
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      );
    }

    const sessionId = sessionRow.id;
    const datasetId = crypto.randomUUID();
    const storagePath = `datasets/${sessionId}/${datasetId}.csv`;

    const { error: uploadError } = await admin.storage
      .from("uploads")
      .upload(storagePath, file, {
        contentType: file.type || "text/csv",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      await admin.from("sessions").delete().eq("id", sessionId);
      return NextResponse.json(
        { error: "Failed to store file. Ensure Supabase Storage bucket 'uploads' exists." },
        { status: 500 }
      );
    }

    await admin.from("datasets").insert({
      id: datasetId,
      session_id: sessionId,
      name: file.name,
      file_size: file.size,
      row_count: 0,
      column_count: 0,
      upload_status: "processing",
      storage_path: storagePath,
      expires_at: expiresAt.toISOString(),
    });

    const text = await file.text();
    const parseResult = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      preview: MAX_ROWS_TO_PROFILE,
    });

    const rows = parseResult.data;
    const headers = parseResult.meta.fields || [];
    if (headers.length === 0 || rows.length === 0) {
      await admin.from("datasets").update({ upload_status: "failed" }).eq("id", datasetId);
      return NextResponse.json(
        { error: "CSV has no headers or no data rows" },
        { status: 400 }
      );
    }

    const profiles = profileColumns(rows, headers);
    const summary = computeDatasetProfile(profiles);

    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const { data: colRow } = await admin
        .from("dataset_columns")
        .insert({
          dataset_id: datasetId,
          name: p.name,
          ordinal_position: p.ordinal_position,
          inferred_type: p.inferred_type,
          nullable: p.null_count > 0,
          distinct_count: p.distinct_count,
          null_count: p.null_count,
          is_primary_key_candidate: p.is_primary_key_candidate,
          is_categorical_candidate: p.is_categorical_candidate,
        })
        .select("id")
        .single();

      if (colRow) {
        await admin.from("column_statistics").insert({
          column_id: colRow.id,
          min_numeric: p.min_numeric,
          max_numeric: p.max_numeric,
          avg_numeric: p.avg_numeric,
          median_numeric: p.median_numeric,
          min_datetime: p.min_datetime ?? null,
          max_datetime: p.max_datetime ?? null,
        });
        for (const sample of p.samples) {
          await admin.from("column_samples").insert({
            column_id: colRow.id,
            sample_value: sample,
          });
        }
      }
    }

    await admin.from("dataset_profiles").insert({
      dataset_id: datasetId,
      probable_primary_keys: summary.probable_primary_keys,
      categorical_columns: summary.categorical_columns,
      datetime_columns: summary.datetime_columns,
      numeric_columns: summary.numeric_columns,
      detected_relationships: summary.detected_relationships,
      quality_score: summary.quality_score,
    });

    await admin
      .from("datasets")
      .update({
        row_count: rows.length,
        column_count: headers.length,
        upload_status: "ready",
        processed_at: new Date().toISOString(),
      })
      .eq("id", datasetId);

    return NextResponse.json({ datasetId });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
