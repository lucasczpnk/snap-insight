"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { DatasetWorkspace } from "@/components/DatasetWorkspace";
import { mapApiResponseToDatasetInfo } from "@/lib/dataset-api";
import type { DatasetInfo } from "@/types/dataset";

/** Shareable report page — publicly accessible, no auth required. Replicates workspace view. */
export default function ReportByIdPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;
  const [dataset, setDataset] = useState<DatasetInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Missing report ID");
      return;
    }
    fetch(`/api/datasets/${id}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error("Report not found or expired");
          if (res.status === 202) throw new Error("Report is still processing");
          throw new Error("Failed to load report");
        }
        return res.json();
      })
      .then((apiData) => {
        setDataset(mapApiResponseToDatasetInfo(apiData));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error ?? "Report not found"}</p>
          <button type="button" onClick={() => router.push("/")} className="btn-primary">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <DatasetWorkspace
      dataset={dataset}
      onUploadNew={() => router.push("/")}
      shareUrl={id ? `/report/${id}` : null}
      isSharedView
    />
  );
}
