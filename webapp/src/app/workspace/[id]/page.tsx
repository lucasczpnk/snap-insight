"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { DatasetWorkspace } from "@/components/DatasetWorkspace";
import { mapApiResponseToDatasetInfo } from "@/lib/dataset-api";
import type { DatasetInfo } from "@/types/dataset";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60;

export default function WorkspaceByIdPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;
  const [dataset, setDataset] = useState<DatasetInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Missing dataset ID");
      return;
    }
    let cancelled = false;

    async function poll() {
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        if (cancelled) return;
        const res = await fetch(`/api/datasets/${id}`);
        if (cancelled) return;
        if (res.status === 200) {
          const apiData = await res.json();
          setDataset(mapApiResponseToDatasetInfo(apiData));
          setLoading(false);
          setProcessing(false);
          return;
        }
        if (res.status === 404) {
          setError("Dataset not found or expired");
          setLoading(false);
          setProcessing(false);
          return;
        }
        if (res.status === 202) {
          setProcessing(true);
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          continue;
        }
        setError("Failed to load dataset");
        setLoading(false);
        setProcessing(false);
        return;
      }
      setError("Processing timed out. Please try again.");
      setLoading(false);
      setProcessing(false);
    }

    poll();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">{processing ? "Processing dataset..." : "Loading dataset..."}</p>
        </div>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error ?? "Dataset not found"}</p>
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
