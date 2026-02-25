"use client";

import React, { useState, useMemo } from "react";
import { FileSpreadsheet, BarChart3, AlertTriangle, Info } from "lucide-react";
import type { DatasetInfo } from "@/types/dataset";

interface DatasetWorkspaceProps {
  dataset: DatasetInfo;
  onUploadNew: () => void;
  shareUrl?: string | null;
}

export function DatasetWorkspace({ dataset, onUploadNew, shareUrl }: DatasetWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "insights">("overview");
  const [expandedColumn, setExpandedColumn] = useState<string | null>(null);

  const schemaSummary = useMemo(() => {
    const numeric = dataset.columns.filter((c) => c.type === "number").length;
    const categorical = dataset.columns.filter((c) => c.type === "categorical" || c.isCategoricalCandidate).length;
    const datetime = dataset.columns.filter((c) => c.type === "date").length;
    const string = dataset.columns.filter((c) => c.type === "string").length;
    const primaryKeyCandidates = dataset.columns.filter((c) => c.isPrimaryKeyCandidate).length;
    return { numeric, categorical, datetime, string, primaryKeyCandidates };
  }, [dataset.columns]);

  const qualityFlags = useMemo(() => {
    const flags: { column: string; message: string }[] = [];
    dataset.columns.forEach((col) => {
      const nullPct = (col.nullCount / dataset.rowCount) * 100;
      if (nullPct > 50) flags.push({ column: col.name, message: `High null rate (${nullPct.toFixed(0)}%)` });
      if (col.type === "string" && col.uniqueCount > dataset.rowCount * 0.9 && dataset.rowCount > 10) {
        flags.push({ column: col.name, message: "High cardinality (likely identifier)" });
      }
    });
    return flags;
  }, [dataset.columns, dataset.rowCount]);

  return (
    <div className="min-h-screen pt-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="glass-card p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">{dataset.name}</h2>
              <p className="text-gray-400">
                {dataset.rowCount.toLocaleString()} rows × {dataset.columnCount} columns
              </p>
            </div>
            <div className="flex items-center gap-3">
              {shareUrl && (
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-sm"
                >
                  Open share link
                </a>
              )}
              <button onClick={onUploadNew} className="btn-secondary text-sm">
                Upload New File
              </button>
            </div>
          </div>

          <div className="flex gap-4 border-b border-gray-800 pb-4 mb-6">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-2 rounded-lg transition-colors ${activeTab === "overview" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              <FileSpreadsheet className="w-4 h-4 inline mr-2" />
              Schema Explorer
            </button>
            <button
              onClick={() => setActiveTab("insights")}
              className={`px-4 py-2 rounded-lg transition-colors ${activeTab === "insights" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              <BarChart3 className="w-4 h-4 inline mr-2" />
              Auto Dashboard
            </button>
          </div>

          {activeTab === "overview" ? (
            <div className="space-y-6">
              <div className="glass-card p-4 border border-indigo-500/20">
                <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                  <Info className="w-4 h-4 text-indigo-400" />
                  Schema summary
                </h3>
                <ul className="text-sm text-gray-400 space-y-1">
                  {schemaSummary.primaryKeyCandidates > 0 && (
                    <li>• {schemaSummary.primaryKeyCandidates} probable primary key(s)</li>
                  )}
                  {schemaSummary.categorical > 0 && (
                    <li>• {schemaSummary.categorical} categorical dimension(s)</li>
                  )}
                  {schemaSummary.datetime > 0 && (
                    <li>• {schemaSummary.datetime} timestamp field(s)</li>
                  )}
                  {schemaSummary.numeric > 0 && (
                    <li>• {schemaSummary.numeric} numeric column(s)</li>
                  )}
                  {schemaSummary.string > 0 && (
                    <li>• {schemaSummary.string} text column(s)</li>
                  )}
                </ul>
              </div>

              {qualityFlags.length > 0 && (
                <div className="glass-card p-4 border border-amber-500/20">
                  <h3 className="text-sm font-semibold text-amber-200 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Data quality flags
                  </h3>
                  <ul className="text-sm text-gray-400 space-y-1">
                    {qualityFlags.map((f) => (
                      <li key={`${f.column}-${f.message}`}>
                        <span className="font-mono text-gray-300">{f.column}</span>: {f.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <h3 className="text-lg font-semibold mb-2">Column analysis</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-800">
                      <th className="pb-3 pr-4">Column</th>
                      <th className="pb-3 pr-4">Type</th>
                      <th className="pb-3 pr-4">Null %</th>
                      <th className="pb-3 pr-4">Unique</th>
                      <th className="pb-3">Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.columns.map((col) => (
                      <React.Fragment key={col.name}>
                        <tr
                          className="border-b border-gray-800/50 hover:bg-white/[0.02] cursor-pointer"
                          onClick={() => setExpandedColumn(expandedColumn === col.name ? null : col.name)}
                        >
                          <td className="py-3 pr-4 font-mono text-sm">{col.name}</td>
                          <td className="py-3 pr-4">
                            <span className={`px-2 py-1 rounded text-xs ${col.type === "number" ? "bg-blue-500/20 text-blue-400" : col.type === "date" ? "bg-green-500/20 text-green-400" : col.type === "categorical" ? "bg-purple-500/20 text-purple-400" : "bg-gray-500/20 text-gray-400"}`}>
                              {col.type}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-gray-400">
                            {((col.nullCount / dataset.rowCount) * 100).toFixed(1)}%
                          </td>
                          <td className="py-3 pr-4 text-gray-400">{col.uniqueCount.toLocaleString()}</td>
                          <td className="py-3 text-gray-400 font-mono text-sm">
                            {col.min !== undefined && col.max !== undefined ? `${col.min} - ${col.max}` : "-"}
                          </td>
                        </tr>
                        {expandedColumn === col.name && (
                          <tr className="border-b border-gray-800/50 bg-white/[0.02]">
                            <td colSpan={5} className="py-3 px-4">
                              <div className="text-sm space-y-2 pl-4 border-l-2 border-indigo-500/40">
                                <p className="text-gray-400">
                                  Sample values: {col.samples.slice(0, 5).join(", ")}
                                  {col.samples.length > 5 && " …"}
                                </p>
                                {col.nullCount > 0 && (
                                  <p className="text-amber-200/90">
                                    {col.nullCount} null value(s) ({(col.nullCount / dataset.rowCount * 100).toFixed(1)}%)
                                  </p>
                                )}
                                {col.isPrimaryKeyCandidate && (
                                  <p className="text-indigo-300">Likely primary key (unique, non-null)</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Rows", value: dataset.rowCount.toLocaleString() },
                  { label: "Columns", value: dataset.columnCount },
                  { label: "Numeric Columns", value: dataset.columns.filter((c) => c.type === "number").length },
                  { label: "Categorical", value: dataset.columns.filter((c) => c.type === "categorical").length },
                ].map((stat) => (
                  <div key={stat.label} className="glass-card p-4 text-center">
                    <div className="text-2xl font-bold text-gradient">{stat.value}</div>
                    <div className="text-sm text-gray-400">{stat.label}</div>
                  </div>
                ))}
              </div>

              {dataset.columns.filter((c) => c.type === "number").length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Numeric Distributions</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {dataset.columns.filter((c) => c.type === "number").slice(0, 6).map((col) => {
                      const values = col.samples.map(Number).filter((n) => !isNaN(n));
                      const min = values.length ? Math.min(...values) : 0;
                      const max = values.length ? Math.max(...values) : 0;
                      const sum = values.reduce((a, b) => a + b, 0);
                      const mean = values.length ? sum / values.length : 0;
                      const sorted = [...values].sort((a, b) => a - b);
                      const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
                      const bucketCount = 10;
                      const range = max - min || 1;
                      const bucketSize = range / bucketCount;
                      const buckets = Array(bucketCount).fill(0);
                      values.forEach((v) => {
                        const bucketIdx = Math.min(Math.floor((v - min) / bucketSize), bucketCount - 1);
                        buckets[bucketIdx]++;
                      });
                      const maxBucket = Math.max(...buckets, 1);
                      return (
                        <div key={col.name} className="glass-card p-4">
                          <h4 className="font-semibold mb-2">{col.name}</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                            <div className="text-gray-400">Mean: <span className="text-white font-mono">{mean.toFixed(2)}</span></div>
                            <div className="text-gray-400">Median: <span className="text-white font-mono">{median.toFixed(2)}</span></div>
                            <div className="text-gray-400">Min: <span className="text-white font-mono">{min.toFixed(2)}</span></div>
                            <div className="text-gray-400">Max: <span className="text-white font-mono">{max.toFixed(2)}</span></div>
                          </div>
                          <div className="flex items-end gap-1 h-24">
                            {buckets.map((count, i) => (
                              <div key={i} className="flex-1 bg-indigo-500/60 rounded-t" style={{ height: `${(count / maxBucket) * 100}%` }} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {dataset.columns.filter((c) => c.type === "categorical").length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Categorical Breakdown</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {dataset.columns.filter((c) => c.type === "categorical").slice(0, 6).map((col) => {
                      const freq: Record<string, number> = {};
                      col.samples.forEach((s) => { freq[s] = (freq[s] || 0) + 1; });
                      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
                      const maxCount = sorted[0]?.[1] || 1;
                      return (
                        <div key={col.name} className="glass-card p-4">
                          <h4 className="font-semibold mb-4">{col.name}</h4>
                          <div className="space-y-2">
                            {sorted.map(([value, count]) => (
                              <div key={value}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="truncate max-w-[120px]" title={value}>{value}</span>
                                  <span className="text-gray-400">{count}</span>
                                </div>
                                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {dataset.columns.filter((c) => c.type === "date").length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Date Ranges</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {dataset.columns.filter((c) => c.type === "date").slice(0, 6).map((col) => (
                      <div key={col.name} className="glass-card p-4">
                        <h4 className="font-semibold mb-2">{col.name}</h4>
                        <div className="space-y-2 text-sm">
                          <div className="text-gray-400">Earliest: <span className="text-white font-mono">{col.samples[0] || "N/A"}</span></div>
                          <div className="text-gray-400">Latest: <span className="text-white font-mono">{col.samples[col.samples.length - 1] || "N/A"}</span></div>
                          <div className="text-gray-400">Unique: <span className="text-white">{col.uniqueCount.toLocaleString()}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
