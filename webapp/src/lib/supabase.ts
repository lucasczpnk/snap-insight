// Supabase Client Configuration
// TODO: Replace placeholder values with your actual Supabase credentials

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "YOUR_SUPABASE_URL_HERE";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY_HERE";

export const supabaseConfig = {
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
};

export const authProviders = {
  github: {
    clientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || "YOUR_GITHUB_CLIENT_ID",
    redirectUri: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
  },
  google: {
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID",
    redirectUri: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
  },
};

// Tier limits configuration (from project-guidelines.md)
export const TIERS = {
  free_anon: {
    maxFileSizeMB: 10,
    maxRows: 100_000,
    retentionHours: 0.25, // 15 minutes
  },
  free_auth: {
    maxFileSizeMB: 10,
    maxRows: 100_000,
    retentionHours: 24,
  },
  paid: {
    maxFileSizeMB: 35,
    maxRows: 300_000,
    retentionHours: 24 * 30,
  },
};

export type Tier = keyof typeof TIERS;
