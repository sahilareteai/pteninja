import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
app.use(express.json());

// Lazy Stripe initialization
let stripe: Stripe | null = null;
const getStripe = () => {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
};

// Map planId → Stripe recurring interval
const PLAN_INTERVALS: Record<string, { interval: "day" | "week" | "month" | "year"; interval_count: number }> = {
  monthly:   { interval: "month", interval_count: 1 },
  quarterly: { interval: "month", interval_count: 3 },
  annual:    { interval: "year",  interval_count: 1 },
};

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV, vercel: !!process.env.VERCEL });
});

// ─── Create Subscription ───────────────────────────────────────────────────────
// Creates a Stripe Customer (if needed) and a Subscription.
// Card details are stored securely by Stripe (PCI DSS Level 1 certified).
// We never receive or store raw card data.
app.post("/api/create-subscription", async (req, res) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const { planId, planName, amount, currency = "aud", email, existingCustomerId } = req.body;

  if (!planId || !amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid plan or amount" });
  }

  const recurring = PLAN_INTERVALS[planId];
  if (!recurring) {
    return res.status(400).json({ error: "Unknown plan ID" });
  }

  try {
    // Reuse an existing Stripe Customer or create a new one
    let customerId: string = existingCustomerId ?? "";
    if (!customerId) {
      const customer = await stripeInstance.customers.create({
        ...(email ? { email } : {}),
        metadata: { planId },
      });
      customerId = customer.id;
    }

    // Create subscription with inline price so no pre-created Stripe Price IDs are needed
    const subscription = await stripeInstance.subscriptions.create({
      customer: customerId,
      items: [
        {
          price_data: {
            currency,
            product_data: { name: `PTENinja ${planName ?? planId}` },
            recurring,
            unit_amount: amount, // already in cents
          } as any,
        },
      ],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
    }) as any;

    const invoice = subscription.latest_invoice as Stripe.Invoice & { payment_intent: Stripe.PaymentIntent };
    const paymentIntent = invoice.payment_intent;

    res.json({
      clientSecret: paymentIntent.client_secret,
      subscriptionId: subscription.id,
      customerId,
      currentPeriodEnd: subscription.current_period_end, // Unix timestamp
    });
  } catch (error: any) {
    console.error("Stripe subscription error:", error);
    res.status(400).json({ error: error.message });
  }
});

// ─── Stripe Customer Portal ────────────────────────────────────────────────────
// Opens the Stripe-hosted portal so users can update payment methods, view
// invoices, and manage their subscription.  No card data touches our servers.
app.post("/api/customer-portal", async (req, res) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const { customerId, returnUrl } = req.body;
  if (!customerId) {
    return res.status(400).json({ error: "customerId is required" });
  }

  try {
    const session = await stripeInstance.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl ?? "https://pteninja.vercel.app",
    });
    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Customer portal error:", error);
    res.status(400).json({ error: error.message });
  }
});

// ─── Cancel Subscription (at period end) ─────────────────────────────────────
// Marks the subscription to cancel at the end of the current billing period.
// The user keeps access until that date; no further charges are made.
app.post("/api/cancel-subscription", async (req, res) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const { subscriptionId } = req.body;
  if (!subscriptionId) {
    return res.status(400).json({ error: "subscriptionId is required" });
  }

  try {
    const subscription = await stripeInstance.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    }) as any;
    res.json({
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscription.current_period_end,
    });
  } catch (error: any) {
    console.error("Cancel subscription error:", error);
    res.status(400).json({ error: error.message });
  }
});

// ─── Reactivate Subscription ──────────────────────────────────────────────────
// Reverses a "cancel at period end" so the subscription continues to renew.
app.post("/api/reactivate-subscription", async (req, res) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const { subscriptionId } = req.body;
  if (!subscriptionId) {
    return res.status(400).json({ error: "subscriptionId is required" });
  }

  try {
    const subscription = await stripeInstance.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    }) as any;
    res.json({
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscription.current_period_end,
    });
  } catch (error: any) {
    console.error("Reactivate subscription error:", error);
    res.status(400).json({ error: error.message });
  }
});

// ─── Sync Subscription Status ─────────────────────────────────────────────────
// Returns the latest subscription state from Stripe so the client can keep
// Firestore in sync (e.g. after returning from the Customer Portal).
app.post("/api/sync-subscription", async (req, res) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const { subscriptionId } = req.body;
  if (!subscriptionId) {
    return res.status(400).json({ error: "subscriptionId is required" });
  }

  try {
    const subscription = await stripeInstance.subscriptions.retrieve(subscriptionId) as any;
    res.json({
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  } catch (error: any) {
    console.error("Sync subscription error:", error);
    res.status(400).json({ error: error.message });
  }
});

// ─── Legacy: one-time Payment Intent (kept for backward compatibility) ────────
app.post("/api/create-payment-intent", async (req, res) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ 
      error: "Stripe is not configured on the server. Please add STRIPE_SECRET_KEY to environment variables." 
    });
  }

  const { amount, currency = "aud", receipt_email } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  try {
    const paymentIntent = await stripeInstance.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      ...(receipt_email ? { receipt_email } : {}),
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error: any) {
    console.error("Stripe error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Vite setup for local development ONLY
async function setupVite() {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
}

// Only start the server if this file is run directly (local dev)
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  setupVite().then(() => {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
}

export default app;
