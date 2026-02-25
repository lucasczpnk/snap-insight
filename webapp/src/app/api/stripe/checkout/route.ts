import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const priceIdPro = process.env.STRIPE_PRICE_ID_PRO;

export async function POST(request: Request) {
  if (!stripeSecretKey || !priceIdPro) {
    return NextResponse.json(
      { error: "Stripe is not configured. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID_PRO to your environment." },
      { status: 503 }
    );
  }

  try {
    const { origin } = new URL(request.url);
    const stripe = new Stripe(stripeSecretKey);

    let body: { returnTo?: string; userId?: string; customerEmail?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body is fine
    }

    const returnTo = typeof body.returnTo === "string" ? body.returnTo : "/?checkout=success";
    const successUrl = returnTo.startsWith("http") ? returnTo : `${origin}${returnTo.startsWith("/") ? returnTo : `/${returnTo}`}`;

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceIdPro, quantity: 1 }],
      success_url: successUrl,
      cancel_url: `${origin}/#pricing`,
      allow_promotion_codes: true,
    };

    if (body.userId) sessionConfig.client_reference_id = body.userId;
    if (body.customerEmail) sessionConfig.customer_email = body.customerEmail;

    const session = await stripe.checkout.sessions.create(sessionConfig);

    if (!session.url) {
      return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      { status: 500 }
    );
  }
}
