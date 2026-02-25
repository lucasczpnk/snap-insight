import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

async function upsertSubscription(
  userId: string | null,
  stripeCustomerId: string | null,
  status: string,
  currentPeriodEnd: string | null
) {
  if (!userId) return;
  const admin = createAdminClient();
  await admin.from("user_profiles").upsert(
    {
      id: userId,
      stripe_customer_id: stripeCustomerId,
      subscription_status: status,
      subscription_tier: status === "active" ? "paid" : null,
      current_period_end: currentPeriodEnd,
    },
    { onConflict: "id" }
  );
}

export async function POST(request: Request) {
  if (!stripeSecretKey || !webhookSecret) {
    console.error("Stripe webhook: Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(stripeSecretKey);
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id as string | null;
        const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        let currentPeriodEnd: string | null = null;

        if (session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : (session.subscription as { id?: string })?.id;
          if (subId) {
            const sub = await new Stripe(stripeSecretKey).subscriptions.retrieve(subId);
            const periodEnd = (sub as { current_period_end?: number }).current_period_end;
            currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
          }
        }

        await upsertSubscription(userId, stripeCustomerId, "active", currentPeriodEnd);
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription & { current_period_end?: number };
        const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        const currentPeriodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        if (sub.metadata?.supabase_user_id) {
          await upsertSubscription(
            sub.metadata.supabase_user_id,
            stripeCustomerId,
            sub.status,
            currentPeriodEnd
          );
        } else {
          const admin = createAdminClient();
          const { data: profile } = await admin
            .from("user_profiles")
            .select("id")
            .eq("stripe_customer_id", stripeCustomerId)
            .single();
          if (profile) {
            await upsertSubscription(profile.id, stripeCustomerId, sub.status, currentPeriodEnd);
          }
        }
        break;
      }
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription & { current_period_end?: number };
        const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        const currentPeriodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        const admin = createAdminClient();
        const { data: profile } = await admin
          .from("user_profiles")
          .select("id")
          .eq("stripe_customer_id", stripeCustomerId)
          .single();
        if (profile) {
          await upsertSubscription(profile.id, stripeCustomerId, sub.status, currentPeriodEnd);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

        const admin = createAdminClient();
        const { data: profile } = await admin
          .from("user_profiles")
          .select("id")
          .eq("stripe_customer_id", stripeCustomerId)
          .single();
        if (profile) {
          await upsertSubscription(profile.id, stripeCustomerId, "canceled", null);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
