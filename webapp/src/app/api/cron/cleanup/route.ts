import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cleanup worker: deletes expired datasets and their Supabase Storage objects.
 * Invoke via Vercel Cron or external cron (e.g. every 15 min).
 * Optional: set CRON_SECRET and send Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();

    const { data: expired } = await admin
      .from("datasets")
      .select("id, storage_path")
      .lt("expires_at", new Date().toISOString());

    if (!expired?.length) {
      return NextResponse.json({ deleted: 0, message: "No expired datasets" });
    }

    let storageDeleted = 0;
    for (const row of expired) {
      if (row.storage_path) {
        const { error } = await admin.storage
          .from("uploads")
          .remove([row.storage_path]);
        if (!error) storageDeleted++;
        // Continue even if storage delete fails (object may already be gone)
      }
    }

    const { error: deleteError } = await admin
      .from("datasets")
      .delete()
      .lt("expires_at", new Date().toISOString());

    if (deleteError) {
      console.error("Cleanup delete error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete dataset rows" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      deleted: expired.length,
      storageDeleted,
      message: `Removed ${expired.length} expired datasets (${storageDeleted} storage objects)`,
    });
  } catch (err) {
    console.error("Cleanup error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cleanup failed" },
      { status: 500 }
    );
  }
}
