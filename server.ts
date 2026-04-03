import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import dotenv from "dotenv";
import { cert, getApps, initializeApp as initAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { rateLimit } from "express-rate-limit";
import nodemailer from "nodemailer";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// ─── Stripe Webhook ───────────────────────────────────────────────────────────
// IMPORTANT: This route must be registered BEFORE app.use(express.json()) so
// that express.raw() can capture the raw body needed for signature verification.
app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).json({ error: "Stripe webhook secret is not configured." });
  }

  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;
  try {
    event = stripeInstance.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const adminInstance = getAdminApp();
  if (!adminInstance) {
    console.error("Firebase Admin not configured – cannot update Firestore from webhook.");
    // Still acknowledge the event so Stripe doesn't retry indefinitely.
    return res.json({ received: true });
  }
  const db = getAdminFirestore(adminInstance, FIREBASE_DATABASE_ID);

  const updateUserBySubscription = async (
    subscriptionId: string,
    updates: Record<string, unknown>,
  ) => {
    const snapshot = await db
      .collection("users")
      .where("stripeSubscriptionId", "==", subscriptionId)
      .limit(1)
      .get();
    if (!snapshot.empty) {
      await snapshot.docs[0].ref.update(updates);
    }
  };

  switch (event.type) {
    case "customer.subscription.updated": {
      const sub = event.data.object as unknown as SubscriptionRuntime;
      const updates: Record<string, unknown> = {
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        subscriptionEndsAt: new Date(sub.current_period_end * 1000).toISOString(),
      };
      if (sub.status === "active") {
        updates.subscriptionStatus = "active";
      } else if (sub.status === "canceled" || sub.status === "unpaid" || sub.status === "past_due") {
        updates.subscriptionStatus = "inactive";
      }
      await updateUserBySubscription(sub.id, updates);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as unknown as SubscriptionRuntime;
      await updateUserBySubscription(sub.id, {
        subscriptionStatus: "inactive",
        cancelAtPeriodEnd: false,
        subscriptionEndsAt: new Date(sub.current_period_end * 1000).toISOString(),
      });
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
});

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

  const { planId, planName, amount, currency = "aud", email, existingCustomerId, promoCode } = req.body;

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
      ...(promoCode ? { metadata: { promoCode } } : {}),
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
      discounts: [{ coupon: COUPON_ID }],
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

  const { subscriptionId, customerId } = req.body;

  try {
    let resolvedSubscriptionId: string = subscriptionId ?? "";

    // If no subscriptionId, look up the most recent subscription for the customer
    // using status: 'all' to avoid multiple sequential API calls.
    if (!resolvedSubscriptionId && customerId) {
      const subs = await stripeInstance.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 1,
      });
      if (subs.data.length > 0) {
        resolvedSubscriptionId = subs.data[0].id;
      }
    }

    if (!resolvedSubscriptionId) {
      return res.status(400).json({ error: "No subscription found" });
    }

    const subscription = await stripeInstance.subscriptions.retrieve(resolvedSubscriptionId) as unknown as SubscriptionRuntime;
    res.json({
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      subscriptionId: resolvedSubscriptionId,
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

// ─── Support Bot: PTE-restricted Gemini chat ─────────────────────────────────
const SUPPORT_BOT_SYSTEM_PROMPT = `You are a helpful customer support assistant for PTE Ninja, an AI-powered PTE Academic exam preparation platform.

Your responsibilities:
- Answer questions about PTE Academic (exam format, scoring, sections, tips, strategies)
- Help users understand their scores and feedback from PTE Ninja
- Assist with questions about the PTE Ninja platform, its features, and subscriptions
- Provide study advice and practice strategies for PTE Speaking, Writing, Reading, and Listening
- Troubleshoot common issues users face on the platform

IMPORTANT RULES:
1. ONLY discuss topics related to PTE Academic, English language skills for PTE, or the PTE Ninja platform.
2. If asked about unrelated topics (sports, politics, cooking, other exams like IELTS/TOEFL unless comparing to PTE, etc.), politely decline and redirect the user back to PTE-related help.
3. Be empathetic, encouraging, and professional at all times.
4. Keep responses concise — aim for 2–4 short paragraphs maximum.
5. If you cannot resolve an issue (e.g., account-specific billing problems, technical bugs), advise the user to click "Send to Support Team" so a human agent can follow up.
6. Never make up Stripe, Firebase, or account-specific details you do not know.`;

/** Strip control characters / newlines from user-supplied strings used in prompts.
 * NOTE: Non-ASCII characters (e.g. accented letters in international names) are
 * preserved; only ASCII control characters (0x00–0x1F, 0x7F) and other C1 controls
 * are stripped to prevent prompt injection while supporting global users.
 */
function sanitizePromptValue(value: string, maxLen = 100): string {
  return (value ?? "")
    .replace(/[\r\n\t]/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    .slice(0, maxLen)
    .trim();
}

/** Escape HTML special characters to prevent XSS in email bodies. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Simple, ReDoS-safe email format check. */
function isValidEmail(email: string): boolean {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) return false;
  const domain = email.slice(atIndex + 1);
  return domain.length > 0 && domain.includes(".");
}

/** Validate a single history entry has the expected shape. */
function isValidHistoryEntry(h: unknown): h is { role: "user" | "model"; parts: Array<{ text: string }> } {
  if (!h || typeof h !== "object") return false;
  const entry = h as Record<string, unknown>;
  if (entry.role !== "user" && entry.role !== "model") return false;
  if (!Array.isArray(entry.parts)) return false;
  return entry.parts.every((p) => typeof p === "object" && p !== null && typeof (p as Record<string, unknown>).text === "string");
}

const supportChatLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

app.post("/api/support-chat", supportChatLimiter, async (req, res) => {
  const { message, history, userDetails } = req.body as {
    message: string;
    history: unknown[];
    userDetails: { name: string; email: string; issueType: string };
  };

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "Message is required." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "AI service is currently unavailable." });
  }

  // Keep last 20 turns (10 user + 10 model) to respect the model's context window
  // while still maintaining enough context for multi-turn support conversations.
  const safeHistory: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = (
    Array.isArray(history) ? history : []
  )
    .filter(isValidHistoryEntry)
    .slice(-20);

  const safeUserName = sanitizePromptValue(userDetails?.name ?? "User");
  const safeIssueType = sanitizePromptValue(userDetails?.issueType ?? "General");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = `${SUPPORT_BOT_SYSTEM_PROMPT}\n\nUser name: ${safeUserName}\nIssue type: ${safeIssueType}`;

    // Build the full contents array: history + new user message
    const contents = [
      ...safeHistory.map((h) => ({ role: h.role, parts: h.parts })),
      { role: "user" as const, parts: [{ text: message.trim() }] },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: { systemInstruction },
    });

    const text = response.text ?? "";
    res.json({ response: text });
  } catch (error) {
    console.error("Support chat error:", error);
    res.status(500).json({ error: "Failed to generate response. Please try again." });
  }
});

// ─── Support Ticket: collect details and email to Google Groups ───────────────
const supportTicketLimiter = rateLimit({
  windowMs: 60_000 * 10,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many ticket submissions. Please try again later." },
});

function createMailTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  // Fallback: Gmail with app password (GMAIL_USER / GMAIL_APP_PASSWORD)
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (gmailUser && gmailPass) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });
  }

  return null;
}

app.post("/api/support-ticket", supportTicketLimiter, async (req, res) => {
  const { userDetails, conversation } = req.body as {
    userDetails: { name: string; email: string; issueType: string; description: string };
    conversation: string;
  };

  if (!userDetails?.name || !userDetails?.email || !userDetails?.description) {
    return res.status(400).json({ error: "Incomplete ticket details." });
  }

  if (!isValidEmail(userDetails.email)) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  // Generate a short, human-friendly ticket ID (e.g. "TKT-A3F2B1C9")
  const ticketId = `TKT-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  const supportEmail = process.env.SUPPORT_EMAIL;
  if (!supportEmail) {
    console.warn("SUPPORT_EMAIL not configured — ticket logged to console.");
    console.log("=== Support Ticket ===");
    console.log(JSON.stringify({ ticketId, userDetails, conversation }, null, 2));
    return res.json({ success: true, message: "Ticket received.", ticketId });
  }

  const transport = createMailTransport();
  if (!transport) {
    console.warn("No SMTP config found — ticket logged to console.");
    console.log("=== Support Ticket ===");
    console.log(JSON.stringify({ ticketId, userDetails, conversation }, null, 2));
    return res.json({ success: true, message: "Ticket received.", ticketId });
  }

  const submittedAt = new Date().toISOString();
  const safeSubmittedAt = escapeHtml(submittedAt);

  const subject = `[PTE Ninja Support] [${ticketId}] ${userDetails.issueType} — ${userDetails.name}`;
  const textBody = [
    `PTE Ninja Support Ticket`,
    `========================`,
    `Ticket ID: ${ticketId}`,
    `Submitted: ${submittedAt}`,
    `Name:      ${userDetails.name}`,
    `Email:     ${userDetails.email}`,
    `Issue:     ${userDetails.issueType}`,
    ``,
    `--- Initial Description ---`,
    userDetails.description,
    ``,
    `--- Chat Conversation ---`,
    conversation ?? "(no conversation recorded)",
  ].join("\n");

  const safeName = escapeHtml(userDetails.name);
  const safeEmail = escapeHtml(userDetails.email);
  const safeIssue = escapeHtml(userDetails.issueType);
  const safeDescription = escapeHtml(userDetails.description);
  const safeConversation = escapeHtml(conversation ?? "(no conversation recorded)");
  const safeTicketId = escapeHtml(ticketId);

  const htmlBody = `
<html><body style="font-family:sans-serif;max-width:700px;margin:auto;color:#333">
<h2 style="color:#1a1a2e">PTE Ninja &#8212; Support Ticket</h2>
<table style="border-collapse:collapse;width:100%">
  <tr><td style="padding:6px 12px;font-weight:bold;width:130px">Ticket ID</td><td style="padding:6px 12px;font-family:monospace;font-size:15px;color:#6c63ff"><strong>${safeTicketId}</strong></td></tr>
  <tr style="background:#f5f5f5"><td style="padding:6px 12px;font-weight:bold">Submitted</td><td style="padding:6px 12px">${safeSubmittedAt}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold">Name</td><td style="padding:6px 12px">${safeName}</td></tr>
  <tr style="background:#f5f5f5"><td style="padding:6px 12px;font-weight:bold">Email</td><td style="padding:6px 12px"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold">Issue Type</td><td style="padding:6px 12px">${safeIssue}</td></tr>
</table>
<h3>Initial Description</h3>
<p style="background:#f9f9f9;padding:12px;border-left:4px solid #6c63ff;white-space:pre-wrap">${safeDescription}</p>
<h3>Chat Conversation</h3>
<pre style="background:#f9f9f9;padding:12px;white-space:pre-wrap;font-size:13px">${safeConversation}</pre>
</body></html>`;

  // Confirmation email sent back to the user
  const confirmationSubject = `[PTE Ninja] Your support request has been received — ${ticketId}`;
  const confirmationTextBody = [
    `Hi ${userDetails.name},`,
    ``,
    `Thank you for reaching out to the PTE Ninja support team.`,
    ``,
    `Your support ticket has been successfully submitted.`,
    ``,
    `  Ticket ID:  ${ticketId}`,
    `  Issue Type: ${userDetails.issueType}`,
    `  Submitted:  ${submittedAt}`,
    ``,
    `Our team typically responds within 1–2 business days. Please keep your ticket ID handy when following up.`,
    ``,
    `If you have additional information to share, simply reply to this email.`,
    ``,
    `Best regards,`,
    `The PTE Ninja Support Team`,
  ].join("\n");

  const confirmationHtmlBody = `
<html><body style="font-family:sans-serif;max-width:600px;margin:auto;color:#333">
<h2 style="color:#1a1a2e">PTE Ninja &#8212; Support Request Received</h2>
<p>Hi <strong>${safeName}</strong>,</p>
<p>Thank you for reaching out to the PTE Ninja support team. Your ticket has been successfully submitted.</p>
<table style="border-collapse:collapse;width:100%;margin:16px 0">
  <tr><td style="padding:8px 12px;font-weight:bold;width:130px;background:#f5f5f5">Ticket ID</td><td style="padding:8px 12px;font-family:monospace;font-size:15px;color:#6c63ff;background:#f5f5f5"><strong>${safeTicketId}</strong></td></tr>
  <tr><td style="padding:8px 12px;font-weight:bold">Issue Type</td><td style="padding:8px 12px">${safeIssue}</td></tr>
  <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5">Submitted</td><td style="padding:8px 12px;background:#f5f5f5">${safeSubmittedAt}</td></tr>
</table>
<p>Our team typically responds within <strong>1&#8211;2 business days</strong>. Please keep your ticket ID (<strong>${safeTicketId}</strong>) handy when following up.</p>
<p>If you have additional information to share, simply reply to this email.</p>
<p>Best regards,<br><strong>The PTE Ninja Support Team</strong></p>
</body></html>`;

  const fromAddress = process.env.SMTP_USER ?? process.env.GMAIL_USER ?? "no-reply@pteninja.com";

  try {
    await transport.sendMail({
      from: fromAddress,
      to: supportEmail,
      replyTo: userDetails.email,
      subject,
      text: textBody,
      html: htmlBody,
    });

    // Best-effort confirmation to the user — don't fail the whole request if this step errors
    try {
      await transport.sendMail({
        from: fromAddress,
        to: userDetails.email,
        subject: confirmationSubject,
        text: confirmationTextBody,
        html: confirmationHtmlBody,
      });
    } catch (confirmError) {
      console.warn("Could not send confirmation email to user:", confirmError);
    }

    res.json({ success: true, message: "Support ticket sent successfully.", ticketId });
  } catch (error) {
    console.error("Failed to send support ticket email:", error);
    res.status(500).json({ error: "Failed to send ticket. Please try again." });
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
