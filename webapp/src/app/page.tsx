"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Sparkles, Upload, FileSpreadsheet, BarChart3, Share2, CheckCircle2, Zap, Shield, Github, X, LogOut, Loader2 } from "lucide-react";
import Papa from "papaparse";
import { createClientIfConfigured } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { ColumnMetadata, DatasetInfo } from "@/types/dataset";
import { mapApiResponseToDatasetInfo } from "@/lib/dataset-api";
import { DatasetWorkspace } from "@/components/DatasetWorkspace";
import { storePendingUpload, consumePendingUpload } from "@/lib/pending-upload";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dataset, setDataset] = useState<DatasetInfo | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authLoading, setAuthLoading] = useState<"github" | "google" | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authError, setAuthError] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadConstraint, setUploadConstraint] = useState<{
    type: "file_size" | "row_count";
    actual: number;
    limit: number;
    unit: string;
  } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [loginForUpgrade, setLoginForUpgrade] = useState(false);
  const [pendingUpgradeFile, setPendingUpgradeFile] = useState<File | null>(null);
  const [activatingSubscription, setActivatingSubscription] = useState(false);
  const [postCheckoutActivating, setPostCheckoutActivating] = useState(false); // true when poll timed out, waiting for webhook

  const [supabase, setSupabase] = useState<ReturnType<typeof createClientIfConfigured>>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setSupabase(createClientIfConfigured());
  }, [mounted]);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    setAuthError(params.get("auth_error") === "1");
    if (params.get("upgrade") === "1") setLoginForUpgrade(true);
    if (params.get("checkout") === "success" && params.get("retry") !== "1") {
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setUploadError(null);
    setUploadConstraint(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (uploadRes.ok) {
        const { datasetId } = (await uploadRes.json()) as { datasetId: string };
        const getRes = await fetch(`/api/datasets/${datasetId}`);
        if (getRes.ok) {
          const apiData = await getRes.json();
          setDataset(mapApiResponseToDatasetInfo(apiData));
          setIsProcessing(false);
          return;
        }
      }
      // API rejected: tier limit (413) or validation (400) — show upgrade modal with constraint cause, do not fall back
      if (uploadRes.status === 413 || uploadRes.status === 400) {
        const body = await uploadRes.json().catch(() => ({}));
        const constraintMessage = (body?.error as string)?.trim();
        const constraint = body?.constraint as { type?: string; actual?: number; limit?: number; unit?: string } | undefined;
        setUploadError(
          constraintMessage || (uploadRes.status === 413 ? "File or row limit exceeded for your plan. Upgrade to Pro for more." : uploadRes.statusText || "Upload rejected")
        );
        // Use API constraint when present; else derive file-size from client File when 413 (e.g. if platform rejected before our route)
        let resolvedConstraint: { type: "file_size" | "row_count"; actual: number; limit: number; unit: string } | null = null;
        const actualNum = constraint?.actual != null ? Number(constraint.actual) : NaN;
        const limitNum = constraint?.limit != null ? Number(constraint.limit) : NaN;
        if (constraint?.type && !Number.isNaN(actualNum) && !Number.isNaN(limitNum)) {
          resolvedConstraint = {
            type: constraint.type as "file_size" | "row_count",
            actual: actualNum,
            limit: limitNum,
            unit: constraint.unit ?? (constraint.type === "file_size" ? "MB" : "rows"),
          };
        } else if (uploadRes.status === 413 && file.size > 10 * 1024 * 1024) {
          const fileSizeMB = Math.round((file.size / (1024 * 1024)) * 10) / 10;
          resolvedConstraint = { type: "file_size", actual: fileSizeMB, limit: 10, unit: "MB" };
        }
        setUploadConstraint(resolvedConstraint);
        setPendingUpgradeFile(file);
        setShowUpgradeModal(true);
        setIsProcessing(false);
        return;
      }
    } catch (_) {
      // Network/server error — fall through to client-side parsing
    }
    Papa.parse(file, {
      header: true,
      preview: 1000,
      complete: (results) => {
        const data = results.data as Record<string, string>[];
        const columns: ColumnMetadata[] = [];
        const headers = results.meta.fields || [];
        headers.forEach((header) => {
          const values = data.map((row) => row[header]).filter(Boolean);
          const nullCount = data.length - values.length;
          const uniqueCount = new Set(values).size;
          let type: ColumnMetadata["type"] = "string";
          const numericValues = values.map(Number).filter((v) => !isNaN(v));
          const dateValues = values.filter((v) => !isNaN(Date.parse(v)));
          if (numericValues.length > values.length * 0.8) type = "number";
          else if (dateValues.length > values.length * 0.8) type = "date";
          else if (uniqueCount <= 10) type = "categorical";
          columns.push({
            name: header,
            type,
            nullCount,
            uniqueCount,
            min: type === "number" ? Math.min(...numericValues) : undefined,
            max: type === "number" ? Math.max(...numericValues) : undefined,
            samples: values.slice(0, 5),
          });
        });
        setDataset({
          name: file.name,
          rowCount: data.length,
          columnCount: headers.length,
          columns,
        });
        setIsProcessing(false);
      },
    });
  }, []);

  useEffect(() => {
    if (!mounted || !processFile) return;
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (params.get("checkout") !== "success" || params.get("retry") !== "1") return;
    window.history.replaceState({}, "", window.location.pathname);

    const pollAndRetry = async () => {
      const file = await consumePendingUpload();
      if (!file) return;
      setActivatingSubscription(true);
      const maxAttempts = 25; // ~37s to allow Stripe webhook to update user_profiles
      for (let i = 0; i < maxAttempts; i++) {
        try {
          const res = await fetch("/api/tier");
          const { tier } = (await res.json()) as { tier: string };
          if (tier === "paid") {
            setActivatingSubscription(false);
            setPostCheckoutActivating(false);
            processFile(file);
            return;
          }
        } catch {
          // Ignore
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setActivatingSubscription(false);
      setPostCheckoutActivating(true);
      setPendingUpgradeFile(file);
      setUploadError("Your Pro subscription is activating. Please wait a moment and click Retry.");
      setUploadConstraint(null);
      setShowUpgradeModal(true);
    };
    pollAndRetry();
  }, [mounted, processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) {
      processFile(file);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleSignIn = useCallback(
    async (provider: "github" | "google") => {
      if (!supabase) return;
      setAuthLoading(provider);
      setAuthError(false);
      try {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const next = loginForUpgrade ? "/?upgrade=1" : "/";
        const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo },
        });
        if (error) {
          setAuthError(true);
        } else if (data?.url) {
          window.location.href = data.url;
        }
        // On success with data.url, we redirect; no need to reset loading here
      } catch {
        setAuthError(true);
      } finally {
        setAuthLoading(null);
      }
    },
    [supabase, loginForUpgrade]
  );

  const handleSignOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setShowLoginModal(false);
  }, [supabase]);

  const handleUpgrade = useCallback(async () => {
    if (!user) {
      if (pendingUpgradeFile) {
        try {
          await storePendingUpload(pendingUpgradeFile);
        } catch {
          // Ignore
        }
      }
      setShowUpgradeModal(false);
      setLoginForUpgrade(true);
      setShowLoginModal(true);
      return;
    }
    setShowUpgradeModal(false);
    setUploadError(null);
    setUploadConstraint(null);
    setPostCheckoutActivating(false);
    const fileToRetry = pendingUpgradeFile;
    if (fileToRetry) {
      try {
        await storePendingUpload(fileToRetry);
      } catch {
        // Ignore storage errors
      }
      setPendingUpgradeFile(null);
    }
    const hasPendingFile = !!fileToRetry || loginForUpgrade;
    try {
      const returnTo = hasPendingFile ? "/?checkout=success&retry=1" : "/?checkout=success";
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnTo,
          userId: user.id,
          customerEmail: user.email ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        window.location.href = data.url;
      } else if (res.status === 503) {
        setUploadError(data?.error || "Upgrade is not configured yet.");
        setShowUpgradeModal(true);
        setPendingUpgradeFile(fileToRetry ?? null);
      } else {
        setUploadError(data?.error || "Failed to start checkout.");
        setShowUpgradeModal(true);
        setPendingUpgradeFile(fileToRetry ?? null);
      }
    } catch {
      setUploadError("Failed to start checkout.");
      setShowUpgradeModal(true);
      setPendingUpgradeFile(fileToRetry ?? null);
    }
  }, [user, pendingUpgradeFile, loginForUpgrade]);

  const handleRetryAfterCheckout = useCallback(async () => {
    const file = pendingUpgradeFile;
    if (!file) return;
    try {
      const res = await fetch("/api/tier");
      const { tier } = (await res.json()) as { tier: string };
      if (tier === "paid") {
        setShowUpgradeModal(false);
        setUploadError(null);
        setUploadConstraint(null);
        setPostCheckoutActivating(false);
        setPendingUpgradeFile(null);
        processFile(file);
      } else {
        setUploadError("Subscription still activating. Please wait a few seconds and click Retry again.");
      }
    } catch {
      setUploadError("Could not check subscription. Please try again.");
    }
  }, [pendingUpgradeFile, processFile]);

  const handlePricingAction = useCallback((action: "auth" | "stripe" | "disabled") => {
    if (action === "auth") setShowLoginModal(true);
    else if (action === "stripe") handleUpgrade();
  }, [handleUpgrade]);

  useEffect(() => {
    if (!user || !loginForUpgrade || !mounted) return;
    setLoginForUpgrade(false);
    if (typeof window !== "undefined" && window.location.search.includes("upgrade=1")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    handleUpgrade();
  }, [user, loginForUpgrade, mounted, handleUpgrade]);

  // Show loading while hydrating
  if (!mounted) {
    return <div className="min-h-screen bg-[#0a0a0f]" />;
  }

  // Dataset Workspace View
  if (dataset) {
    // Use relative URL to avoid hydration mismatch (same on server and client)
    const shareUrl = dataset.id ? `/report/${dataset.id}` : null;
    return (
      <DatasetWorkspace
        dataset={dataset}
        onUploadNew={() => setDataset(null)}
        shareUrl={shareUrl}
      />
    );
  }

  // Login Modal
  const LoginModal = () => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowLoginModal(false); setLoginForUpgrade(false); }} />
      <div className="relative glass-card p-8 max-w-md w-full mx-4">
        <button onClick={() => { setShowLoginModal(false); setLoginForUpgrade(false); }} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold mb-2">Welcome to Snap Insight</h2>
        <p className="text-gray-400 mb-6">
          {loginForUpgrade ? "Sign in to upgrade to Pro and unlock higher limits." : "Sign in to unlock more features and longer data retention."}
        </p>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleSignIn("github")}
            disabled={!!authLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {authLoading === "github" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Github className="w-5 h-5" />
            )}
            Continue with GitHub
          </button>
          {/* Google auth — disabled for now
          <button
            type="button"
            onClick={() => handleSignIn("google")}
            disabled={!!authLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white text-black hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {authLoading === "google" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </button>
          */}
        </div>
        <p className="text-center text-gray-500 text-sm mt-6">
          Or continue as <button type="button" onClick={() => { setShowLoginModal(false); setLoginForUpgrade(false); }} className="text-indigo-400 hover:underline">guest</button> (limited features)
        </p>
      </div>
    </div>
  );

  // Landing Page
  return (
    <main className="min-h-screen">
      {showLoginModal && <LoginModal />}
      {authError && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 text-sm">
          Sign-in failed. Please try again.
        </div>
      )}
      {showUpgradeModal && uploadError && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowUpgradeModal(false); setUploadError(null); setUploadConstraint(null); setPendingUpgradeFile(null); setPostCheckoutActivating(false); }} />
          <div className="relative glass-card p-8 max-w-md w-full mx-4">
            <button
              onClick={() => { setShowUpgradeModal(false); setUploadError(null); setUploadConstraint(null); setPendingUpgradeFile(null); setPostCheckoutActivating(false); }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold mb-2">
              {postCheckoutActivating ? "Subscription Activating" : uploadError.includes("exceeds") || uploadError.includes("limit") ? "Limit Reached" : "Upgrade"}
            </h2>
            <p className={`text-gray-400 ${uploadConstraint ? "mb-2" : "mb-6"}`}>{uploadError}</p>
            {uploadConstraint && (
              <p className="text-red-400 text-sm font-medium mb-6">
                {uploadConstraint.type === "file_size"
                  ? `${uploadConstraint.actual} MB / ${uploadConstraint.limit} MB limit`
                  : `${uploadConstraint.actual.toLocaleString()} rows / ${uploadConstraint.limit.toLocaleString()} limit`}
              </p>
            )}
            <div className="flex gap-3">
              {postCheckoutActivating ? (
                <button
                  type="button"
                  onClick={handleRetryAfterCheckout}
                  className="flex-1 btn-primary py-3"
                >
                  Retry upload
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleUpgrade}
                  className="flex-1 btn-primary py-3"
                >
                  Upgrade to Pro
                </button>
              )}
              <button
                type="button"
                onClick={() => { setShowUpgradeModal(false); setUploadError(null); setUploadConstraint(null); setPendingUpgradeFile(null); setPostCheckoutActivating(false); }}
                className="flex-1 btn-secondary py-3"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gradient">Snap Insight</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="text-gray-300 hover:text-white transition-colors">How it Works</a>
            <a href="#pricing" className="text-gray-300 hover:text-white transition-colors">Pricing</a>
          </div>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 truncate max-w-[140px]" title={user.email}>
                {user.user_metadata?.user_name ?? user.email ?? "Signed in"}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-2 btn-secondary text-sm py-2 px-3"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowLoginModal(true)} className="btn-primary text-sm py-2 px-4">
              Get Started
            </button>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-screen mesh-gradient flex items-center justify-center px-6 pt-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="opacity-0 animate-[fadeIn_0.6s_ease-out_forwards]">
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              <span className="text-gradient">Upload Data ↓</span>
              <br />
              Instantly Understand It
            </h1>
            <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
              Snap Insight transforms your CSV files into structured insights. 
              No SQL, no BI tools, no manual configuration required.
            </p>
          </div>

          <div
            className={`glass-card p-12 transition-all duration-300 animate-[fadeIn_0.6s_ease-out_0.2s_forwards] opacity-0 ${isDragging ? "border-indigo-500 scale-105" : ""}`}
            style={{ animationDelay: "0.2s" }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            {isProcessing || activatingSubscription ? (
              <div className="py-12">
                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-400">
                  {activatingSubscription ? "Activating your Pro subscription..." : "Processing your dataset..."}
                </p>
              </div>
            ) : (
              <>
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                  <Upload className="w-10 h-10 text-indigo-400" />
                </div>
                <h3 className="text-2xl font-semibold mb-2">Drop your CSV file here</h3>
                <p className="text-gray-400 mb-6">or click to browse • Max 10MB for free tier</p>
                <input type="file" accept=".csv" onChange={handleFileSelect} className="hidden" id="file-upload" />
                <label htmlFor="file-upload" className="btn-primary inline-block cursor-pointer">Select File</label>
              </>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-8 mt-12 opacity-0 animate-[fadeIn_0.6s_ease-out_0.4s_forwards]" style={{ animationDelay: "0.4s" }}>
            {[
              { icon: Zap, text: "Instant Analysis" },
              { icon: FileSpreadsheet, text: "Schema Explorer" },
              { icon: BarChart3, text: "Auto Dashboard" },
              { icon: Share2, text: "Shareable Views" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-gray-400">
                <Icon className="w-5 h-5 text-indigo-400" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything You Need to <span className="text-gradient">Understand Your Data</span></h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">Upload a CSV, get instant insights. No setup, no configuration, no expertise required.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { icon: FileSpreadsheet, title: "Schema Explorer", description: "Automatically generated dataset documentation with column analysis, type inference, and data quality insights." },
              { icon: BarChart3, title: "Auto Dashboard", description: "Instant visual insights with automatic chart generation based on your data types." },
              { icon: Share2, title: "Shareable Views", description: "Share read-only dashboards with your team. No authentication required for viewers." },
              { icon: Shield, title: "Secure Processing", description: "Your data stays private. Files are processed locally and automatically deleted after 24 hours." },
            ].map((feature, i) => (
              <div key={feature.title} className="glass-card p-6 hover:border-indigo-500/30 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-gray-400 text-lg">Four simple steps to data understanding</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { num: "01", title: "Upload CSV", description: "Drag and drop your file or click to browse" },
              { num: "02", title: "Auto Analysis", description: "We analyze your data in seconds" },
              { num: "03", title: "Explore Insights", description: "View schema and dashboards automatically" },
              { num: "04", title: "Share", description: "Share with your team via public link" },
            ].map((step) => (
              <div key={step.num} className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl glass flex items-center justify-center">
                  <span className="text-2xl font-bold text-gradient">{step.num}</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-gray-400 text-sm">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-gray-400 text-lg">Start free, upgrade when you need more</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: "Free", price: "$0", period: "forever", description: "Perfect for trying things out", features: ["Up to 100k rows", "10MB file size", "15 min retention", "Basic analysis"], cta: "Get Started", popular: false, action: "auth" as const },
              { name: "Pro", price: "$19", period: "/month", description: "For regular data work", features: ["Up to 300k rows", "35MB file size", "30 day retention", "Advanced analysis", "Priority support", "Shareable links"], cta: "Upgrade Now", popular: true, action: "stripe" as const },
              { name: "Team", price: "$59", period: "/month", description: "For teams and agencies", features: ["Unlimited rows", "100MB file size", "Unlimited retention", "Team collaboration", "API access", "Custom branding"], cta: "Available soon", popular: false, action: "disabled" as const },
            ].map((plan) => (
              <div key={plan.name} className={`glass-card p-6 relative ${plan.popular ? "border-indigo-500" : ""}`}>
                {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full text-xs font-semibold">Most Popular</div>}
                <h3 className="text-lg font-semibold mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-gray-400">{plan.period}</span>
                </div>
                <p className="text-gray-400 text-sm mb-6">{plan.description}</p>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                      <span className="text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>
                {plan.action === "auth" ? (
                  <button
                    type="button"
                    onClick={() => handlePricingAction("auth")}
                    className={`w-full ${plan.popular ? "btn-primary" : "btn-secondary"}`}
                  >
                    {plan.cta}
                  </button>
                ) : plan.action === "stripe" ? (
                  <button
                    type="button"
                    onClick={() => handlePricingAction("stripe")}
                    className="w-full btn-primary"
                  >
                    {plan.cta}
                  </button>
                ) : (
                  <div className="w-full py-3 px-4 rounded-xl bg-gray-800/50 text-gray-500 text-center text-sm font-medium cursor-not-allowed">
                    {plan.cta}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">Snap Insight</span>
            </div>
            <div className="flex gap-8 text-gray-400 text-sm">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Contact</a>
            </div>
            <p className="text-gray-500 text-sm">© 2024 Snap Insight. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
