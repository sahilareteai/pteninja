import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import dotenv from "dotenv";
import { cert, getApps, initializeApp as initAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { rateLimit } from "express-rate-limit";

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

// Lazy Firebase Admin initialization
// FIREBASE_DATABASE_ID defaults to the project's custom database (same value as in firebase-applet-config.json)
const FIREBASE_DATABASE_ID = process.env.FIREBASE_DATABASE_ID ?? "pteninja-prod";
// ADMIN_EMAILS: comma-separated list of emails that have admin access (same check as Firestore security rules)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "sg.analyst93@gmail.com")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);
const getAdminApp = () => {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) return null;
  if (getApps().length > 0) return getApps()[0];
  try {
    return initAdminApp({ credential: cert(JSON.parse(serviceAccount)) });
  } catch {
    return null;
  }
};

// Rate limiter for admin mutation endpoints
const deleteUserLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

// Map planId → Stripe recurring interval
const PLAN_INTERVALS: Record<string, { interval: "day" | "week" | "month" | "year"; interval_count: number }> = {
  monthly:   { interval: "month", interval_count: 1 },
  quarterly: { interval: "month", interval_count: 3 },
  annual:    { interval: "year",  interval_count: 1 },
};

// Minimal subscription shape we need at runtime.
// Stripe SDK v21 wraps responses in Stripe.Response<T> and doesn't surface every
// field on the TS types; we rely on the well-documented REST contract instead.
interface SubscriptionRuntime {
  id: string;
  status: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
  // latest_invoice is a string ID when NOT expanded, or a full Invoice object when expanded.
  latest_invoice?: {
    id?: string;
    // payment_intent is a string ID when NOT expanded, or a full PI object when expanded.
    // Removed in Stripe API >= 2025-03-31.basil; prefer confirmation_secret below.
    payment_intent?: { client_secret: string | null } | string | null;
    // confirmation_secret replaced payment_intent in Stripe API >= 2025-03-31.basil.
    confirmation_secret?: { client_secret: string | null } | null;
  } | string | null;
}

// Extract a payment client_secret from the subscription, handling every possible
// shape Stripe can return (fully-expanded PI object, string PI ID, string invoice ID,
// or missing expand entirely).  Makes extra API calls only when necessary.
async function extractClientSecret(
  stripeInstance: Stripe,
  subscription: SubscriptionRuntime,
): Promise<string | null> {
  const rawInvoice = subscription.latest_invoice;

  // ── Case 1: fully-expanded Invoice object ──────────────────────────────────
  if (rawInvoice && typeof rawInvoice === "object") {
    // Stripe API >= 2025-03-31.basil: use confirmation_secret (preferred)
    const cs = rawInvoice.confirmation_secret;
    if (cs && typeof cs === "object" && cs.client_secret) {
      return cs.client_secret;
    }

    // Stripe API < 2025-03-31.basil: fall back to payment_intent
    const pi = rawInvoice.payment_intent;
    if (pi && typeof pi === "object") {
      // Fully expanded – use client_secret directly
      return pi.client_secret ?? null;
    }
    if (typeof pi === "string") {
      // Invoice expanded but PI is a string ID – retrieve PI
      const piObj = await stripeInstance.paymentIntents.retrieve(pi) as unknown as { client_secret: string | null };
      return piObj.client_secret ?? null;
    }
    // Neither found on the expanded object – fall through to invoice retrieval
    if (rawInvoice.id) {
      return retrieveClientSecretFromInvoice(stripeInstance, rawInvoice.id);
    }
    return null;
  }

  // ── Case 2: latest_invoice is a plain string ID (expand was not applied) ───
  if (typeof rawInvoice === "string") {
    return retrieveClientSecretFromInvoice(stripeInstance, rawInvoice);
  }

  return null;
}

// Retrieve an invoice by ID and extract the payment client_secret.
async function retrieveClientSecretFromInvoice(
  stripeInstance: Stripe,
  invoiceId: string,
): Promise<string | null> {
  const invoice = await stripeInstance.invoices.retrieve(invoiceId, {
    expand: ["confirmation_secret", "payment_intent"],
  }) as unknown as {
    confirmation_secret?: { client_secret: string | null } | null;
    payment_intent?: { client_secret: string | null } | string | null;
  };

  // Stripe API >= 2025-03-31.basil: use confirmation_secret (preferred)
  const cs = invoice.confirmation_secret;
  if (cs && typeof cs === "object" && cs.client_secret) {
    return cs.client_secret;
  }

  // Stripe API < 2025-03-31.basil: fall back to payment_intent
  const pi = invoice.payment_intent;
  if (pi && typeof pi === "object") {
    return pi.client_secret ?? null;
  }
  if (typeof pi === "string") {
    const piObj = await stripeInstance.paymentIntents.retrieve(pi) as unknown as { client_secret: string | null };
    return piObj.client_secret ?? null;
  }
  return null;
}

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

    // Create an inline price first (product_data is valid on prices.create but NOT
    // on subscription item price_data – passing it there causes a Stripe API error).
    const price = await stripeInstance.prices.create({
      currency,
      product_data: { name: `PTENinja ${planName ?? planId}` },
      recurring,
      unit_amount: amount, // already in cents
    });

    // "default_incomplete" always creates the subscription in an incomplete state
    // and returns a PaymentIntent with a client_secret regardless of whether the
    // customer has a saved default payment method.  This is the correct choice
    // for a checkout flow: the frontend must confirm the payment via the Stripe
    // Payment Element before the subscription becomes active.
    // "allow_incomplete" (Stripe default) would try to charge immediately, which
    // fails with a 400 when the customer has no attached payment source.
    const subscription = await stripeInstance.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent", "latest_invoice.confirmation_secret"],
    }) as unknown as SubscriptionRuntime;

    // If the subscription is already active/trialing, the customer's saved
    // payment method was charged immediately — no client-side action needed.
    if (subscription.status === "active" || subscription.status === "trialing") {
      return res.json({
        clientSecret: null,
        immediatelyActive: true,
        subscriptionId: subscription.id,
        customerId,
        currentPeriodEnd: subscription.current_period_end,
      });
    }

    // Subscription is incomplete — extract the client_secret so the frontend
    // can confirm payment via the Stripe Payment Element.  The helper handles
    // every possible shape Stripe may return (fully-expanded PI, string PI ID,
    // string invoice ID, or unexpanded latest_invoice).
    const clientSecret = await extractClientSecret(stripeInstance, subscription);

    if (!clientSecret) {
      // Unexpected: subscription incomplete but no way to confirm payment.
      // Cancel the orphaned record and fail gracefully.
      try {
        await stripeInstance.subscriptions.cancel(subscription.id);
      } catch {
        // Best-effort cleanup — ignore any cancel error
      }
      console.error(
        "Stripe subscription incomplete but no clientSecret. status=%s, sub=%s, latest_invoice=%s",
        subscription.status,
        subscription.id,
        typeof subscription.latest_invoice === "string"
          ? subscription.latest_invoice
          : typeof subscription.latest_invoice,
      );
      return res.status(500).json({
        error: "Payment could not be initialised. Please try again or contact support.",
      });
    }

    res.json({
      clientSecret,
      subscriptionId: subscription.id,
      customerId,
      currentPeriodEnd: subscription.current_period_end,
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

// ─── Apply Retention Discount ─────────────────────────────────────────────────
// Applies a 10% off "once" coupon to the subscription as a retention offer.
// The coupon PTENINJA_RETENTION_10 is created on first use and reused thereafter.
app.post("/api/apply-retention-discount", async (req, res) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const { subscriptionId } = req.body;
  if (!subscriptionId) {
    return res.status(400).json({ error: "subscriptionId is required" });
  }

  const COUPON_ID = "PTENINJA_RETENTION_10";

  try {
    // Ensure the coupon exists — create it if not.
    try {
      await stripeInstance.coupons.retrieve(COUPON_ID);
    } catch {
      await stripeInstance.coupons.create({
        id: COUPON_ID,
        percent_off: 10,
        duration: "once",
        name: "10% loyalty discount",
      });
    }

    await stripeInstance.subscriptions.update(subscriptionId, {
      coupon: COUPON_ID,
    } as any);

    res.json({ success: true });
  } catch (error: any) {
    console.error("Apply retention discount error:", error);
    res.status(400).json({ error: error.message });
  }
});

// ─── Cancel Subscription (at period end) ─────────────────────────────────────
// Marks the subscription to cancel at the end of the current billing period.
// The user keeps access until that date; no further charges are made.
// If subscriptionId is not provided, customerId can be used to locate the
// active subscription automatically (handles stale Firestore records).
app.post("/api/cancel-subscription", async (req, res) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const { subscriptionId, customerId } = req.body;

  try {
    let resolvedSubscriptionId: string = subscriptionId ?? "";

    if (!resolvedSubscriptionId && customerId) {
      // No subscriptionId supplied — look it up from the customer record.
      const subs = await stripeInstance.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 1,
      });
      if (subs.data.length > 0) {
        resolvedSubscriptionId = subs.data[0].id;
      }
    }

    if (!resolvedSubscriptionId) {
      return res.status(400).json({ error: "subscriptionId is required" });
    }

    const subscription = await stripeInstance.subscriptions.update(resolvedSubscriptionId, {
      cancel_at_period_end: true,
    }) as unknown as SubscriptionRuntime;
    res.json({
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscription.current_period_end,
      subscriptionId: resolvedSubscriptionId,
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
    }) as unknown as SubscriptionRuntime;
    res.json({
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscription.current_period_end,
    });
  } catch (error: any) {
    console.error("Reactivate subscription error:", error);
    res.status(400).json({ error: error.message });
  }
});

// ─── Change Subscription Plan ─────────────────────────────────────────────────
// Switches an existing active Stripe subscription to a different plan
// (upgrade or downgrade).  Prorations are created so the customer is
// credited or charged fairly within the current billing period.
app.post("/api/change-plan", async (req, res) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const { subscriptionId, planId, planName, amount, currency = "aud" } = req.body;

  if (!subscriptionId || !planId || !amount || amount <= 0) {
    return res.status(400).json({ error: "subscriptionId, planId, and amount are required" });
  }

  const recurring = PLAN_INTERVALS[planId];
  if (!recurring) {
    return res.status(400).json({ error: "Unknown plan ID" });
  }

  try {
    // Retrieve the current subscription to find the item ID
    const subscription = await stripeInstance.subscriptions.retrieve(subscriptionId) as unknown as
      SubscriptionRuntime & { items: { data: Array<{ id: string }> } };

    if (!subscription.items?.data?.length) {
      return res.status(400).json({ error: "No subscription items found" });
    }

    const itemId = subscription.items.data[0].id;

    // Create a new inline price for the target plan
    const newPrice = await stripeInstance.prices.create({
      currency,
      product_data: { name: `PTENinja ${planName ?? planId}` },
      recurring,
      unit_amount: amount, // already in cents
    });

    // Swap the subscription item to the new price.
    // create_prorations credits unused time on the old plan and charges the
    // remaining time on the new plan — no extra client-side action required.
    const updated = await stripeInstance.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: newPrice.id }],
      proration_behavior: "create_prorations",
    }) as unknown as SubscriptionRuntime;

    res.json({
      subscriptionId: updated.id,
      status: updated.status,
      currentPeriodEnd: updated.current_period_end,
      cancelAtPeriodEnd: updated.cancel_at_period_end,
    });
  } catch (error: any) {
    console.error("Change plan error:", error);
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
    const subscription = await stripeInstance.subscriptions.retrieve(subscriptionId) as unknown as SubscriptionRuntime;
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

// ─── Delete User ──────────────────────────────────────────────────────────────
// Deletes a user's Firestore document and Firebase Auth account.
// Requires a valid Firebase ID token from an admin user.
app.post("/api/delete-user", deleteUserLimiter, async (req, res) => {
  const adminInstance = getAdminApp();
  if (!adminInstance) {
    return res.status(500).json({ error: "Firebase Admin is not configured on the server." });
  }

  const { uid } = req.body;
  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!idToken) {
    return res.status(401).json({ error: "Authorization token required" });
  }
  if (!uid || typeof uid !== "string") {
    return res.status(400).json({ error: "uid is required" });
  }

  try {
    const decodedToken = await getAdminAuth(adminInstance).verifyIdToken(idToken);

    // Resolve admin status: match Firestore rules (email allowlist or role field)
    let isAdmin = ADMIN_EMAILS.includes(decodedToken.email ?? "");

    if (!isAdmin) {
      try {
        const callerDoc = await getAdminFirestore(adminInstance, FIREBASE_DATABASE_ID)
          .collection("users")
          .doc(decodedToken.uid)
          .get();
        isAdmin = callerDoc.exists && callerDoc.data()?.role === "admin";
      } catch (lookupErr) {
        console.warn("Could not look up caller role, denying admin access:", lookupErr);
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    // Delete Firestore document
    await getAdminFirestore(adminInstance, FIREBASE_DATABASE_ID)
      .collection("users")
      .doc(uid)
      .delete();

    // Delete Firebase Auth user (best-effort — may not exist for guest sessions)
    try {
      await getAdminAuth(adminInstance).deleteUser(uid);
    } catch (authErr) {
      console.warn("Could not delete Firebase Auth user:", uid, authErr instanceof Error ? authErr.message : authErr);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(400).json({ error: "Failed to delete user" });
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
