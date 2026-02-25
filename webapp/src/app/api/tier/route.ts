import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tier } from "@/lib/supabase";

async function resolveTier(userId: string | null): Promise<Tier> {
  if (!userId) return "free_anon";
  const admin = createAdminClient();
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

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const tier = await resolveTier(user?.id ?? null);
    return NextResponse.json({ tier });
  } catch {
    return NextResponse.json({ tier: "free_anon" });
  }
}
