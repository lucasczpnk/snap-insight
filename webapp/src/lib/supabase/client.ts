import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey =
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
  "";

export function createClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase URL and anon key are required. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return createBrowserClient(supabaseUrl, supabaseKey);
}

/** Safe for SSR/build: returns null when env is missing or not in browser. Use in client components. */
export function createClientIfConfigured(): ReturnType<typeof createClient> | null {
  if (typeof window === "undefined") return null;
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    return createBrowserClient(supabaseUrl, supabaseKey);
  } catch {
    return null;
  }
}
