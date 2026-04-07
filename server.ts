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
import { GoogleGenAI, Modality, Type } from "@google/genai";
import type { JWTInput } from "google-auth-library";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// ─── Security headers + CORS ──────────────────────────────────────────────────
// Allowed origins: defaults cover production deployments; override via ALLOWED_ORIGINS env var.
const ALLOWED_ORIGINS: string[] = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (ALLOWED_ORIGINS.length === 0) {
  ALLOWED_ORIGINS.push("https://pteninja.vercel.app", "https://pteninja.com");
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (process.env.NODE_ENV !== "production") {
    res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  // Security hardening headers
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// ─── Gemini Key Rotation ──────────────────────────────────────────────────────
// Base per-key cooldown for the first quota hit. Subsequent consecutive hits on
// the same key use exponential backoff (doubles each time) up to MAX_KEY_COOLDOWN_MS.
// This handles both per-minute rate limits (short cooldown is enough) and daily
// quota exhaustion (key stays cooled down longer so it isn't wastefully retried).
const KEY_COOLDOWN_BASE_MS = 60 * 1000; // 1 minute initial cooldown
const KEY_COOLDOWN_MAX_MS = 60 * 60 * 1000; // 1 hour maximum cooldown
// Alert-email deduplication window — kept longer to avoid inbox spam.
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between alert emails
// Transient (5xx) error retry: retry the same key up to this many times before
// propagating the error. Short linear backoff (1 s, 2 s) is enough to ride out
// momentary model overloads without adding meaningful latency on real failures.
const TRANSIENT_RETRY_MAX = 2;
const TRANSIENT_RETRY_BASE_MS = 1000;

interface ServerKeyState {
  client: GoogleGenAI;
  exhaustedUntil: number;
  consecutiveExhaustions: number; // tracks backoff level per key
  isVertex: boolean; // true for Vertex AI Express Mode keys, false for Gemini Developer API keys
}

function buildServerKeyStates(): ServerKeyState[] {
  const states: ServerKeyState[] = [];

  // Vertex AI Service Account JSON key (highest priority).
  // Set VERTEX_AI_SERVICE_ACCOUNT_JSON to the full contents of your downloaded
  // service account JSON key file. The project_id is read from the JSON itself.
  // Optionally set VERTEX_AI_LOCATION (defaults to "us-central1").
  const saJsonRaw = process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON;
  if (saJsonRaw) {
    try {
      const saJson = JSON.parse(saJsonRaw) as JWTInput & { project_id?: string };
      const project = saJson.project_id;
      const location = process.env.VERTEX_AI_LOCATION ?? "us-central1";
      if (!project) throw new Error("project_id missing from service account JSON");
      states.push({
        client: new GoogleGenAI({
          vertexai: true,
          project,
          location,
          googleAuthOptions: { credentials: saJson },
        }),
        exhaustedUntil: 0,
        consecutiveExhaustions: 0,
        isVertex: true,
      });
    } catch (err) {
      console.error("[Vertex] Failed to parse VERTEX_AI_SERVICE_ACCOUNT_JSON — skipping:", err);
    }
  }

  // Vertex AI Express Mode key: a simple Google Cloud API key restricted to
  // Vertex AI APIs. No project/location needed. Set VERTEX_AI_API_KEY to use.
  const vertexKey = process.env.VERTEX_AI_API_KEY;
  if (vertexKey) {
    states.push({
      client: new GoogleGenAI({ vertexai: true, apiKey: vertexKey }),
      exhaustedUntil: 0,
      consecutiveExhaustions: 0,
      isVertex: true,
    });
  }

  const geminiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ].filter(Boolean) as string[];
  for (const key of geminiKeys) {
    states.push({ client: new GoogleGenAI({ apiKey: key }), exhaustedUntil: 0, consecutiveExhaustions: 0, isVertex: false });
  }

  return states;
}

// Text endpoints (analyze-speaking, analyze-writing, support-chat) use this pool.
const serverGeminiKeys: ServerKeyState[] = buildServerKeyStates();
// TTS endpoint uses a separate pool so its preview-model quota exhaustions do not
// block text endpoints and vice versa.
const serverTTSGeminiKeys: ServerKeyState[] = buildServerKeyStates();

type GeminiGenerateContentParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
type GeminiGenerateContentResult = Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;

// ─── Firestore-backed shared key state ───────────────────────────────────────
// In serverless environments (e.g. Vercel), each cold-start instance has its
// own in-memory key state. We persist exhaustion timestamps to a Firestore
// document so that all instances share the same cooldowns and don't retry a
// key that another instance has already found to be quota-exceeded.
//
// A short in-memory cache avoids reading Firestore on every single request.
// Each key pool (text vs TTS) tracks its own sync timestamp to avoid
// cross-contamination of exhaustion state.
const KEY_STATE_CACHE_TTL_MS = 30_000; // Refresh from Firestore at most every 30 s
const keyStateSyncedAtMap: Record<string, number> = {};

function getKeyStateDoc() {
  const adminInstance = getAdminApp();
  if (!adminInstance) return null;
  // FIREBASE_DATABASE_ID is a module-level const defined after this function;
  // it is always initialized before any request handler runs.
  return getAdminFirestore(adminInstance, FIREBASE_DATABASE_ID).collection("config").doc("geminiKeyState");
}

// Reads Firestore and applies any newer exhaustion state to the given key pool.
// Uses the cached timestamp (keyed by stateField) to avoid Firestore reads more
// often than every 30 s per pool.
async function syncKeyStateFromFirestore(keys: ServerKeyState[], stateField: string): Promise<void> {
  const syncedAt = keyStateSyncedAtMap[stateField] ?? 0;
  if (Date.now() - syncedAt < KEY_STATE_CACHE_TTL_MS) return;
  const doc = getKeyStateDoc();
  if (!doc) return;
  try {
    const snap = await doc.get();
    if (snap.exists) {
      const data = snap.data() as Record<string, Array<{ exhaustedUntil: number; consecutiveExhaustions: number }>>;
      data?.[stateField]?.forEach((entry, i) => {
        if (!keys[i]) return;
        // Only advance exhaustedUntil — never roll it back using stale remote data.
        if ((entry.exhaustedUntil ?? 0) > keys[i].exhaustedUntil) {
          keys[i].exhaustedUntil = entry.exhaustedUntil;
        }
        if ((entry.consecutiveExhaustions ?? 0) > keys[i].consecutiveExhaustions) {
          keys[i].consecutiveExhaustions = entry.consecutiveExhaustions;
        }
      });
    }
    keyStateSyncedAtMap[stateField] = Date.now();
  } catch (err) {
    console.warn("[Gemini] Failed to sync key state from Firestore:", err);
  }
}

// Writes the current in-memory exhaustion state for the given key pool to Firestore
// so other instances can pick it up on their next sync.
async function persistKeyStateToFirestore(keys: ServerKeyState[], stateField: string): Promise<void> {
  const doc = getKeyStateDoc();
  if (!doc) return;
  try {
    await doc.set(
      {
        [stateField]: keys.map((k) => ({
          exhaustedUntil: k.exhaustedUntil,
          consecutiveExhaustions: k.consecutiveExhaustions,
        })),
        updatedAt: Date.now(),
      },
      { merge: true },
    );
    keyStateSyncedAtMap[stateField] = Date.now();
  } catch (err) {
    console.warn("[Gemini] Failed to persist key state to Firestore:", err);
  }
}

// Returns the result of a Gemini generateContent call, rotating through keys on quota errors.
// Uses exponential backoff per key: 1 min → 2 min → 4 min → … up to 1 hour.
// Syncs exhaustion state with Firestore so all serverless instances share the same view.
// Throws an error with message "GEMINI_QUOTA_EXCEEDED" when all keys are exhausted.
// Pass serverTTSGeminiKeys / "ttsKeys" for the TTS endpoint to keep its quota tracking
// independent from the text-model endpoints.
async function serverCallGemini(
  params: GeminiGenerateContentParams,
  keys: ServerKeyState[] = serverGeminiKeys,
  firestoreStateField: string = "keys",
  vertexModel?: string,
): Promise<GeminiGenerateContentResult> {
  // Pull in exhaustion state from other instances before deciding which key to use.
  await syncKeyStateFromFirestore(keys, firestoreStateField);

  const now = Date.now();
  const available = keys.filter((k) => now >= k.exhaustedUntil);

  if (available.length === 0) {
    await sendAllKeysExhaustedAlert(firestoreStateField);
    const err = new Error("GEMINI_QUOTA_EXCEEDED");
    (err as any).status = 429;
    throw err;
  }

  let lastNonQuotaError: any = null;

  keyLoop: for (const keyState of available) {
    for (let attempt = 0; attempt <= TRANSIENT_RETRY_MAX; attempt++) {
      try {
        // When a Vertex AI key is active and a vertex-specific model has been
        // provided, substitute it. This is necessary because some models
        // (e.g. gemini-2.5-flash-preview-tts) are only available on the Gemini
        // Developer API; Vertex AI supports different model names for the same
        // capability (e.g. gemini-2.0-flash for native audio output).
        const effectiveParams =
          keyState.isVertex && vertexModel
            ? { ...params, model: vertexModel }
            : params;
        const result = await keyState.client.models.generateContent(effectiveParams);
        // Success — reset the backoff counter for this key.
        keyState.consecutiveExhaustions = 0;
        return result;
      } catch (e: any) {
        const isQuotaError =
          e.message?.includes("429") ||
          e.message?.includes("RESOURCE_EXHAUSTED") ||
          e.message?.toLowerCase().includes("quota") ||
          e.status === 429 ||
          e.error?.code === 429;

        if (isQuotaError) {
          // Exponential backoff: each consecutive exhaustion doubles the cooldown.
          const backoffMs = Math.min(
            KEY_COOLDOWN_BASE_MS * Math.pow(2, keyState.consecutiveExhaustions),
            KEY_COOLDOWN_MAX_MS,
          );
          keyState.consecutiveExhaustions += 1;
          keyState.exhaustedUntil = Date.now() + backoffMs;
          console.warn(
            `[Gemini] Key quota exceeded (exhaustion #${keyState.consecutiveExhaustions}). ` +
            `Cooling down for ${Math.round(backoffMs / 1000)}s. Switching to next key...`
          );
          // Persist the new exhaustion state so other instances skip this key immediately.
          void persistKeyStateToFirestore(keys, firestoreStateField);
          continue keyLoop; // try the next key
        }

        // Retry transient 5xx errors (model overloads, momentary outages) on the
        // same key before giving up or moving on.
        const isTransientError =
          e.message?.includes("500") ||
          e.message?.includes("503") ||
          e.status === 500 ||
          e.status === 503 ||
          e.error?.code === 500 ||
          e.error?.code === 503 ||
          e.message?.toLowerCase().includes("overloaded") ||
          e.message?.toLowerCase().includes("internal server error");

        if (isTransientError && attempt < TRANSIENT_RETRY_MAX) {
          const retryDelayMs = TRANSIENT_RETRY_BASE_MS * (attempt + 1);
          console.warn(
            `[Gemini] Transient error on attempt ${attempt + 1}/${TRANSIENT_RETRY_MAX + 1} — ` +
            `retrying in ${retryDelayMs}ms. Error: ${e.message ?? e.status}`
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue; // retry same key
        }

        // Non-quota error (e.g. 400 model-not-found, 403 permission-denied) or
        // transient error that exhausted per-key retries: record it and try the
        // next key in the pool instead of throwing immediately. This lets regular
        // Gemini keys serve the request when, for example, the Vertex AI key does
        // not have access to a particular model.
        lastNonQuotaError = e;
        console.warn(
          `[Gemini] Non-quota error on key, switching to next key. ` +
          `Error: ${e.message || `Status: ${e.status}`}`
        );
        continue keyLoop;
      }
    }
  }

  // All available keys failed. If every failure was a quota error the error
  // variable is null and we signal GEMINI_QUOTA_EXCEEDED so callers return 503.
  // If at least one key returned a real (non-quota) error, re-throw it so the
  // caller can surface the underlying problem rather than a misleading 503.
  if (lastNonQuotaError) {
    throw lastNonQuotaError;
  }

  await sendAllKeysExhaustedAlert(firestoreStateField);
  const err = new Error("GEMINI_QUOTA_EXCEEDED");
  (err as any).status = 429;
  throw err;
}

// Deduplication: only send one alert email per exhaustion window, tracked per pool.
const serverAllKeysAlertUntilMap: Record<string, number> = {};

const POOL_LABEL: Record<string, string> = {
  keys: "text",
  ttsKeys: "TTS",
};

async function sendAllKeysExhaustedAlert(stateField: string = "keys") {
  const now = Date.now();
  if (now < (serverAllKeysAlertUntilMap[stateField] ?? 0)) return;
  serverAllKeysAlertUntilMap[stateField] = now + ALERT_COOLDOWN_MS;

  const label = POOL_LABEL[stateField] ?? stateField;
  console.error(`[Gemini] ALL ${label.toUpperCase()} API KEYS EXHAUSTED — sending alert email.`);

  const supportEmail = process.env.SUPPORT_EMAIL;
  if (!supportEmail) {
    console.error("[Gemini] SUPPORT_EMAIL not configured — cannot send alert.");
    return;
  }

  const transport = createMailTransport();
  if (!transport) {
    console.error("[Gemini] No email transport configured — cannot send alert.");
    return;
  }

  const from = process.env.SMTP_USER ?? process.env.GMAIL_USER ?? "no-reply@pteninja.com";
  const keyCount = serverGeminiKeys.length;
  const timestamp = new Date().toISOString();

  try {
    await transport.sendMail({
      from,
      to: supportEmail,
      subject: `[PTE Ninja] ⚠️ All Gemini ${label.toUpperCase()} API Keys Quota Exhausted`,
      text: [
        `⚠️  PTE Ninja — All Gemini ${label.toUpperCase()} API Keys Exhausted`,
        "",
        `All ${keyCount} configured Gemini API key(s) have hit their quota limits for the ${label} endpoint pool.`,
        `Time: ${timestamp}`,
        "",
        "Please rotate or add new API keys (GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3) immediately.",
        "Keys will automatically resume after their cooldown resets.",
      ].join("\n"),
    });
    console.warn("[Gemini] Alert email sent to support team.");
  } catch (mailErr) {
    console.error("[Gemini] Failed to send alert email:", mailErr);
  }
}


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
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      // Only send for subscription invoices with a positive amount charged
      const isSubscriptionInvoice = !!(invoice.parent?.subscription_details?.subscription);
      if (!isSubscriptionInvoice || (invoice.amount_paid ?? 0) <= 0) break;

      const recipientEmail = invoice.customer_email;
      if (!recipientEmail || !isValidEmail(recipientEmail)) break;

      const transport = createMailTransport();
      if (!transport) {
        console.warn("No SMTP config — invoice email not sent for invoice:", invoice.id);
        break;
      }

      const invoiceAppUrl = process.env.APP_URL ?? "https://pteninja.com";
      const fromAddress = process.env.SMTP_USER ?? process.env.GMAIL_USER ?? "no-reply@pteninja.com";

      // Format amount: Stripe stores amounts in the smallest currency unit (cents)
      const currencyUpper = (invoice.currency ?? "aud").toUpperCase();
      const amountFormatted = ((invoice.amount_paid ?? 0) / 100).toFixed(2);
      const amountDisplay = `${currencyUpper} $${amountFormatted}`;

      // Plan description from the first line item
      const planDescription = invoice.lines?.data?.[0]?.description ?? "PTE Ninja Subscription";
      const safePlanDescription = escapeHtml(planDescription);

      // Billing period
      const periodStart = invoice.lines?.data?.[0]?.period?.start
        ? new Date((invoice.lines.data[0].period.start as number) * 1000).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
        : null;
      const periodEnd = invoice.lines?.data?.[0]?.period?.end
        ? new Date((invoice.lines.data[0].period.end as number) * 1000).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
        : null;
      const periodText = periodStart && periodEnd ? `${periodStart} – ${periodEnd}` : null;

      const invoiceNumber = invoice.number ? escapeHtml(invoice.number) : null;
      const rawInvoiceUrl = invoice.hosted_invoice_url ?? null;
      const invoiceUrl = rawInvoiceUrl ? escapeHtml(rawInvoiceUrl) : null;
      const safeEmail = escapeHtml(recipientEmail);
      const paymentDate = new Date((invoice.created ?? Date.now() / 1000) * 1000).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

      const subject = `Payment Confirmed — ${amountDisplay} for PTE Ninja`;

      const textLines = [
        `Hi,`,
        ``,
        `Your payment of ${amountDisplay} for PTE Ninja has been received. Thank you!`,
        ``,
        `Plan: ${planDescription}`,
        `Amount: ${amountDisplay}`,
        `Date: ${paymentDate}`,
        ...(periodText ? [`Billing period: ${periodText}`] : []),
        ...(invoiceNumber ? [`Invoice #: ${invoiceNumber}`] : []),
        ...(rawInvoiceUrl ? [`View invoice: ${rawInvoiceUrl}`] : []),
        ``,
        `Access your account: ${invoiceAppUrl}`,
        ``,
        `Happy studying,`,
        `The PTE Ninja Team`,
      ];
      const textBody = textLines.join("\n");

      const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4ff;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4ff;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(108,99,255,0.10);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6c63ff 0%,#4f46e5 100%);padding:40px 40px 32px;text-align:center;">
              <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:8px 20px;margin-bottom:20px;">
                <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:1px;">PTE Ninja</span>
                <span style="font-size:22px;color:rgba(255,255,255,0.7);margin-left:2px;">⚡</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;line-height:1.3;">Payment Confirmed! ✅</h1>
              <p style="margin:12px 0 0;color:rgba(255,255,255,0.85);font-size:16px;line-height:1.6;">Thank you for your payment. Your subscription is active.</p>
            </td>
          </tr>

          <!-- Invoice Summary -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.7;">Hi,</p>
              <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.7;">
                We've successfully received your payment. Here's a summary of your purchase:
              </p>

              <!-- Details Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:28px;">
                <tr style="background:#f9fafb;">
                  <td style="padding:14px 20px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;" colspan="2">Invoice Details</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;width:40%;">Plan</td>
                  <td style="padding:14px 20px;font-size:14px;color:#1a1a2e;font-weight:600;border-bottom:1px solid #f3f4f6;">${safePlanDescription}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Amount Paid</td>
                  <td style="padding:14px 20px;font-size:16px;color:#6c63ff;font-weight:800;border-bottom:1px solid #f3f4f6;">${amountDisplay}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;font-size:14px;color:#6b7280;${periodText || invoiceNumber ? "border-bottom:1px solid #f3f4f6;" : ""}">Payment Date</td>
                  <td style="padding:14px 20px;font-size:14px;color:#1a1a2e;font-weight:600;${periodText || invoiceNumber ? "border-bottom:1px solid #f3f4f6;" : ""}">${paymentDate}</td>
                </tr>
                ${periodText ? `<tr>
                  <td style="padding:14px 20px;font-size:14px;color:#6b7280;${invoiceNumber ? "border-bottom:1px solid #f3f4f6;" : ""}">Billing Period</td>
                  <td style="padding:14px 20px;font-size:14px;color:#1a1a2e;font-weight:600;${invoiceNumber ? "border-bottom:1px solid #f3f4f6;" : ""}">${periodText}</td>
                </tr>` : ""}
                ${invoiceNumber ? `<tr>
                  <td style="padding:14px 20px;font-size:14px;color:#6b7280;">Invoice #</td>
                  <td style="padding:14px 20px;font-size:14px;color:#1a1a2e;font-weight:600;">${invoiceNumber}</td>
                </tr>` : ""}
              </table>

              ${invoiceUrl ? `<!-- View Invoice CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${invoiceUrl}" style="display:inline-block;background:linear-gradient(135deg,#6c63ff,#4f46e5);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 40px;border-radius:50px;letter-spacing:0.5px;">
                      View Invoice &rarr;
                    </a>
                  </td>
                </tr>
              </table>` : ""}

              <!-- Access Account -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(invoiceAppUrl)}" style="display:inline-block;border:2px solid #6c63ff;color:#6c63ff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 40px;border-radius:50px;">
                      Go to My Account
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:14px;color:#6b7280;text-align:center;line-height:1.6;">
                Have questions? Reply to this email or visit our
                <a href="${escapeHtml(invoiceAppUrl)}" style="color:#6c63ff;text-decoration:none;">support centre</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">
                This receipt was sent to <a href="mailto:${safeEmail}" style="color:#9ca3af;">${safeEmail}</a>.
              </p>
              <p style="margin:0;font-size:12px;color:#d1d5db;">
                &copy; ${new Date().getFullYear()} PTE Ninja. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      try {
        await transport.sendMail({
          from: `PTE Ninja <${fromAddress}>`,
          to: recipientEmail,
          subject,
          text: textBody,
          html: htmlBody,
        });
      } catch (emailErr) {
        console.error("Failed to send invoice email for invoice:", invoice.id, emailErr);
      }
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
});

app.use(express.json({ limit: "10mb" }));

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
// ADMIN_EMAILS: optional comma-separated list of emails with admin access.
// Primary admin check is the Firestore role field (role == 'admin').
// If this env var is not set, only Firestore role-based admin access applies.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
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

// Rate limiter for read-only admin status endpoints
const adminStatusLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

// Rate limiter for authenticated subscription/payment endpoints
const subscriptionLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

// ─── Auth helpers ─────────────────────────────────────────────────────────────

type AdminAppInstance = NonNullable<ReturnType<typeof getAdminApp>>;

/** Verifies the Bearer token in the Authorization header.
 *  Returns the decoded token + admin instance, or sends an error and returns null. */
async function requireAuth(
  req: import("express").Request,
  res: import("express").Response,
): Promise<{ decodedToken: import("firebase-admin/auth").DecodedIdToken; adminInstance: AdminAppInstance } | null> {
  const adminInstance = getAdminApp();
  if (!adminInstance) {
    res.status(500).json({ error: "Firebase Admin is not configured on the server." });
    return null;
  }
  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    res.status(401).json({ error: "Authorization token required." });
    return null;
  }
  try {
    const decodedToken = await getAdminAuth(adminInstance).verifyIdToken(idToken);
    return { decodedToken, adminInstance };
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
    return null;
  }
}

/** Checks that the given Stripe IDs belong to the authenticated user's Firestore record.
 *  Only verifies the IDs that are already set in the document (allows new/first-time operations).
 *  Returns false if the document doesn't exist or if an existing stored ID doesn't match. */
async function verifySubscriptionOwnership(
  adminInstance: AdminAppInstance,
  uid: string,
  opts: { subscriptionId?: string; customerId?: string },
): Promise<boolean> {
  if (!opts.subscriptionId && !opts.customerId) return true; // nothing to check
  try {
    const userDoc = await getAdminFirestore(adminInstance, FIREBASE_DATABASE_ID)
      .collection("users")
      .doc(uid)
      .get();
    if (!userDoc.exists) return false;
    const data = userDoc.data()!;
    // Reject only when the user document already has the ID stored AND it doesn't match.
    if (opts.subscriptionId && data.stripeSubscriptionId && data.stripeSubscriptionId !== opts.subscriptionId) return false;
    if (opts.customerId && data.stripeCustomerId && data.stripeCustomerId !== opts.customerId) return false;
    return true;
  } catch {
    return false;
  }
}

// Map planId → Stripe recurring interval
const PLAN_INTERVALS: Record<string, { interval: "day" | "week" | "month" | "year"; interval_count: number }> = {
  weekly:    { interval: "week",  interval_count: 1 },
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
app.post("/api/create-subscription", subscriptionLimiter, async (req, res) => {
  const authResult = await requireAuth(req, res);
  if (!authResult) return;

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

  // If an existing customer ID is provided, verify it belongs to the authenticated user.
  if (existingCustomerId) {
    const owns = await verifySubscriptionOwnership(authResult.adminInstance, authResult.decodedToken.uid, {
      customerId: existingCustomerId,
    });
    if (!owns) {
      return res.status(403).json({ error: "Forbidden: customer does not belong to this user." });
    }
  }

  try {
    // Reuse an existing Stripe Customer or create a new one
    let customerId: string = existingCustomerId ?? "";
    if (!customerId) {
      // Use the email from the verified token when available, otherwise fall back to client-supplied email.
      const resolvedEmail = authResult.decodedToken.email ?? (typeof email === "string" ? email.trim() : undefined);
      const customer = await stripeInstance.customers.create({
        ...(resolvedEmail ? { email: resolvedEmail } : {}),
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
app.post("/api/customer-portal", subscriptionLimiter, async (req, res) => {
  const authResult = await requireAuth(req, res);
  if (!authResult) return;

  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const { customerId, returnUrl } = req.body;
  if (!customerId) {
    return res.status(400).json({ error: "customerId is required" });
  }

  // Validate that the customerId belongs to the authenticated user.
  const owns = await verifySubscriptionOwnership(authResult.adminInstance, authResult.decodedToken.uid, { customerId });
  if (!owns) {
    return res.status(403).json({ error: "Forbidden: customer does not belong to this user." });
  }

  // Validate the returnUrl against the allowlist to prevent open-redirect abuse.
  const portalFallbackUrl = process.env.APP_URL ?? "https://pteninja.com";
  const resolvedReturnUrl = (() => {
    if (!returnUrl) return portalFallbackUrl;
    try {
      const parsed = new URL(returnUrl as string);
      const allowedHostnames = ALLOWED_ORIGINS.map((o) => new URL(o).hostname);
      if (allowedHostnames.includes(parsed.hostname) || (parsed.hostname === "localhost" && process.env.NODE_ENV !== "production")) {
        return returnUrl as string;
      }
    } catch {
      // fall through to default
    }
    return portalFallbackUrl;
  })();

  try {
    const session = await stripeInstance.billingPortal.sessions.create({
      customer: customerId,
      return_url: resolvedReturnUrl,
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
app.post("/api/apply-retention-discount", subscriptionLimiter, async (req, res) => {
  const authResult = await requireAuth(req, res);
  if (!authResult) return;

  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const { subscriptionId } = req.body;
  if (!subscriptionId) {
    return res.status(400).json({ error: "subscriptionId is required" });
  }

  const owns = await verifySubscriptionOwnership(authResult.adminInstance, authResult.decodedToken.uid, { subscriptionId });
  if (!owns) {
    return res.status(403).json({ error: "Forbidden: subscription does not belong to this user." });
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
app.post("/api/cancel-subscription", subscriptionLimiter, async (req, res) => {
  const authResult = await requireAuth(req, res);
  if (!authResult) return;

  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const { subscriptionId, customerId } = req.body;

  // Verify the subscription/customer belongs to the authenticated user.
  const owns = await verifySubscriptionOwnership(authResult.adminInstance, authResult.decodedToken.uid, {
    subscriptionId: subscriptionId ?? undefined,
    customerId: customerId ?? undefined,
  });
  if (!owns) {
    return res.status(403).json({ error: "Forbidden: subscription does not belong to this user." });
  }

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
app.post("/api/reactivate-subscription", subscriptionLimiter, async (req, res) => {
  const authResult = await requireAuth(req, res);
  if (!authResult) return;

  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const { subscriptionId } = req.body;
  if (!subscriptionId) {
    return res.status(400).json({ error: "subscriptionId is required" });
  }

  const owns = await verifySubscriptionOwnership(authResult.adminInstance, authResult.decodedToken.uid, { subscriptionId });
  if (!owns) {
    return res.status(403).json({ error: "Forbidden: subscription does not belong to this user." });
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
app.post("/api/change-plan", subscriptionLimiter, async (req, res) => {
  const authResult = await requireAuth(req, res);
  if (!authResult) return;

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

  const owns = await verifySubscriptionOwnership(authResult.adminInstance, authResult.decodedToken.uid, { subscriptionId });
  if (!owns) {
    return res.status(403).json({ error: "Forbidden: subscription does not belong to this user." });
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
app.post("/api/sync-subscription", subscriptionLimiter, async (req, res) => {
  const authResult = await requireAuth(req, res);
  if (!authResult) return;

  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const { subscriptionId, customerId } = req.body;

  const owns = await verifySubscriptionOwnership(authResult.adminInstance, authResult.decodedToken.uid, {
    subscriptionId: subscriptionId ?? undefined,
    customerId: customerId ?? undefined,
  });
  if (!owns) {
    return res.status(403).json({ error: "Forbidden: subscription does not belong to this user." });
  }

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
app.post("/api/create-payment-intent", subscriptionLimiter, async (req, res) => {
  const authResult = await requireAuth(req, res);
  if (!authResult) return;

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

// ─── Ensure Admin Role ────────────────────────────────────────────────────────
// Called on sign-in: if the user's email is in ADMIN_EMAILS, persist role:'admin'
// in Firestore using the Admin SDK so it is never overwritten by client-side writes.
app.post("/api/ensure-admin-role", deleteUserLimiter, async (req, res) => {
  const adminInstance = getAdminApp();
  if (!adminInstance) {
    return res.status(500).json({ error: "Firebase Admin is not configured on the server." });
  }

  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ error: "Authorization token required" });
  }

  try {
    const decodedToken = await getAdminAuth(adminInstance).verifyIdToken(idToken);
    const email = decodedToken.email ?? "";

    if (!ADMIN_EMAILS.includes(email)) {
      return res.json({ isAdmin: false });
    }

    await getAdminFirestore(adminInstance, FIREBASE_DATABASE_ID)
      .collection("users")
      .doc(decodedToken.uid)
      .set({ role: "admin" }, { merge: true });

    res.json({ isAdmin: true });
  } catch (error) {
    console.error("Ensure admin role error:", error);
    res.status(400).json({ error: "Failed to ensure admin role" });
  }
});

// ─── Set User Role ────────────────────────────────────────────────────────────
// Allows an admin to set the role of any user to 'admin' or 'user'.
app.post("/api/set-user-role", deleteUserLimiter, async (req, res) => {
  const adminInstance = getAdminApp();
  if (!adminInstance) {
    return res.status(500).json({ error: "Firebase Admin is not configured on the server." });
  }

  const { uid, role } = req.body;
  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!idToken) {
    return res.status(401).json({ error: "Authorization token required" });
  }
  if (!uid || typeof uid !== "string") {
    return res.status(400).json({ error: "uid is required" });
  }
  if (role !== "admin" && role !== "user") {
    return res.status(400).json({ error: "role must be 'admin' or 'user'" });
  }

  try {
    const decodedToken = await getAdminAuth(adminInstance).verifyIdToken(idToken);

    // Resolve admin status
    let isAdmin = ADMIN_EMAILS.includes(decodedToken.email ?? "");
    if (!isAdmin) {
      try {
        const callerDoc = await getAdminFirestore(adminInstance, FIREBASE_DATABASE_ID)
          .collection("users")
          .doc(decodedToken.uid)
          .get();
        isAdmin = callerDoc.exists && callerDoc.data()?.role === "admin";
      } catch (lookupErr) {
        console.warn("Could not look up caller role:", lookupErr);
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    // Prevent downgrading accounts protected by ADMIN_EMAILS
    if (role !== "admin") {
      try {
        const targetAuth = await getAdminAuth(adminInstance).getUser(uid);
        if (ADMIN_EMAILS.includes(targetAuth.email ?? "")) {
          return res.status(403).json({ error: "Cannot remove admin role from a protected admin account" });
        }
      } catch {
        // If we can't look up the target user's email, proceed anyway
      }
    }

    await getAdminFirestore(adminInstance, FIREBASE_DATABASE_ID)
      .collection("users")
      .doc(uid)
      .set({ role }, { merge: true });

    res.json({ success: true, role });
  } catch (error) {
    console.error("Set user role error:", error);
    res.status(400).json({ error: "Failed to set user role" });
  }
});

// ─── Gemini Key Status (admin only) ──────────────────────────────────────────
// Returns current in-memory exhaustion state for all configured Gemini keys.
// Useful for diagnosing quota issues without leaking key values.
app.get("/api/gemini-key-status", adminStatusLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: "Authorization token required" });

  const adminInstance = getAdminApp();
  if (!adminInstance) return res.status(500).json({ error: "Firebase Admin is not configured on the server." });

  try {
    const decodedToken = await getAdminAuth(adminInstance).verifyIdToken(idToken);
    let isAdmin = ADMIN_EMAILS.includes(decodedToken.email ?? "");
    if (!isAdmin) {
      try {
        const callerDoc = await getAdminFirestore(adminInstance, FIREBASE_DATABASE_ID)
          .collection("users")
          .doc(decodedToken.uid)
          .get();
        isAdmin = callerDoc.exists && callerDoc.data()?.role === "admin";
      } catch {
        // deny access if we can't verify
      }
    }
    if (!isAdmin) return res.status(403).json({ error: "Forbidden: Admin access required" });
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const now = Date.now();
  const textKeys = serverGeminiKeys.map((k, i) => {
    const remainingMs = Math.max(0, k.exhaustedUntil - now);
    return {
      index: i,
      available: remainingMs === 0,
      exhaustedUntil: k.exhaustedUntil || null,
      cooldownRemainingSeconds: remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0,
      consecutiveExhaustions: k.consecutiveExhaustions,
    };
  });
  const ttsKeys = serverTTSGeminiKeys.map((k, i) => {
    const remainingMs = Math.max(0, k.exhaustedUntil - now);
    return {
      index: i,
      available: remainingMs === 0,
      exhaustedUntil: k.exhaustedUntil || null,
      cooldownRemainingSeconds: remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0,
      consecutiveExhaustions: k.consecutiveExhaustions,
    };
  });

  res.json({
    totalKeys: serverGeminiKeys.length,
    availableKeys: textKeys.filter((k) => k.available).length,
    lastSyncedAt: keyStateSyncedAtMap["keys"] || null,
    keys: textKeys,
    tts: {
      availableKeys: ttsKeys.filter((k) => k.available).length,
      lastSyncedAt: keyStateSyncedAtMap["ttsKeys"] || null,
      keys: ttsKeys,
    },
  });
});

// ─── Record Visit ─────────────────────────────────────────────────────────────
// Called on app load to increment the visitor counter in Firestore.
// Rate-limited to prevent abuse. No auth required.
const visitLimiter = rateLimit({
  windowMs: 60_000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  message: { error: "Too many requests." },
});

app.post("/api/record-visit", visitLimiter, async (req, res) => {
  const adminInstance = getAdminApp();
  if (!adminInstance) {
    return res.status(200).json({ ok: true }); // Silently skip if admin not configured
  }

  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const analyticsRef = getAdminFirestore(adminInstance, FIREBASE_DATABASE_ID)
      .collection("analytics")
      .doc("visitors");

    const { FieldValue } = await import("firebase-admin/firestore");
    await analyticsRef.set(
      {
        totalVisits: FieldValue.increment(1),
        [`dailyVisits.${today}`]: FieldValue.increment(1),
      },
      { merge: true }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("Record visit error:", error);
    res.status(200).json({ ok: true }); // Don't surface analytics errors to users
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

/** ReDoS-safe email format check. */
function isValidEmail(email: string): boolean {
  if (typeof email !== "string" || email.length > 254) return false;
  const atIndex = email.indexOf("@");
  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) return false;
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (local.length === 0 || local.length > 64) return false;
  // Domain must have at least one dot, no leading/trailing dots or hyphens per label
  if (domain.length < 3 || !domain.includes(".")) return false;
  const domainParts = domain.split(".");
  return domainParts.every((part) => part.length > 0 && /^[A-Za-z0-9-]+$/.test(part) && !part.startsWith("-") && !part.endsWith("-"));
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

  if (serverGeminiKeys.length === 0) {
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
    const systemInstruction = `${SUPPORT_BOT_SYSTEM_PROMPT}\n\nUser name: ${safeUserName}\nIssue type: ${safeIssueType}`;

    // Build the full contents array: history + new user message
    const contents = [
      ...safeHistory.map((h) => ({ role: h.role, parts: h.parts })),
      { role: "user" as const, parts: [{ text: message.trim() }] },
    ];

    const response = await serverCallGemini({
      model: "gemini-2.5-flash-lite",
      contents,
      config: { systemInstruction },
    });

    const text = response.text ?? "";
    res.json({ response: text });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXCEEDED") {
      return res.status(503).json({ error: "AI service is temporarily unavailable. Please try again later." });
    }
    console.error("Support chat error:", error);
    res.status(500).json({ error: "Failed to generate response. Please try again." });
  }
});

// ─── Gemini Quota Alert (called by frontend when all client-side keys exhausted) ──
const geminiQuotaAlertLimiter = rateLimit({
  windowMs: ALERT_COOLDOWN_MS,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Alert already sent." },
});

app.post("/api/gemini-quota-alert", geminiQuotaAlertLimiter, async (_req, res) => {
  await sendAllKeysExhaustedAlert();
  res.json({ ok: true });
});

// ─── Welcome Email ────────────────────────────────────────────────────────────
const welcomeEmailLimiter = rateLimit({
  windowMs: 60_000 * 60, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

app.post("/api/send-welcome-email", welcomeEmailLimiter, async (req, res) => {
  const adminInstance = getAdminApp();
  if (!adminInstance) {
    return res.status(500).json({ error: "Firebase Admin is not configured on the server." });
  }

  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ error: "Authorization token required." });
  }

  let decodedToken: import("firebase-admin/auth").DecodedIdToken;
  try {
    decodedToken = await getAdminAuth(adminInstance).verifyIdToken(idToken);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  // Only send to real (non-anonymous) users with a valid email address
  if (decodedToken.firebase?.sign_in_provider === "anonymous") {
    return res.status(400).json({ error: "Welcome email is not sent to anonymous users." });
  }

  const email = decodedToken.email;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "No valid email address for this user." });
  }

  const transport = createMailTransport();
  if (!transport) {
    // No mail transport configured — log and continue silently so signup still succeeds
    console.warn("No SMTP config found — welcome email not sent for user:", decodedToken.uid);
    return res.json({ success: true, message: "Welcome email skipped (no SMTP config)." });
  }

  const displayName = decodedToken.name ?? email.split("@")[0];
  const safeName = escapeHtml(displayName);
  const safeEmail = escapeHtml(email);
  const appUrl = process.env.APP_URL ?? "https://pteninja.com";
  const upgradeUrl = escapeHtml(appUrl);
  const fromAddress = process.env.SMTP_USER ?? process.env.GMAIL_USER ?? "no-reply@pteninja.com";

  const subject = "Welcome to PTE Ninja 🎉 — Your Journey to PTE Success Starts Now";

  const textBody = [
    `Hi ${displayName},`,
    ``,
    `Welcome to PTE Ninja! 🎉`,
    ``,
    `You now have a 7-day free trial — unlimited access to AI-powered PTE Academic practice.`,
    ``,
    `Ready to unlock the full experience?`,
    ``,
    `Weekly Plan    — A$11/week (was A$15)`,
    `Monthly Plan   — A$21/month (was A$35)`,
    `Quarterly Plan — A$50 for 3 months (was A$90) ⭐ Best Value`,
    `Annual Plan    — A$175/year (was A$350) — Save 50%`,
    ``,
    `Upgrade now: ${appUrl}`,
    ``,
    `Happy studying,`,
    `The PTE Ninja Team`,
  ].join("\n");

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to PTE Ninja</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4ff;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4ff;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(108,99,255,0.10);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6c63ff 0%,#4f46e5 100%);padding:40px 40px 32px;text-align:center;">
              <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:8px 20px;margin-bottom:20px;">
                <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:1px;">PTE Ninja</span>
                <span style="font-size:22px;color:rgba(255,255,255,0.7);margin-left:2px;">⚡</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;line-height:1.3;">Welcome aboard, ${safeName}! 🎉</h1>
              <p style="margin:12px 0 0;color:rgba(255,255,255,0.85);font-size:16px;line-height:1.6;">Your AI-powered PTE Academic journey starts today.</p>
            </td>
          </tr>

          <!-- Trial Banner -->
          <tr>
            <td style="background:#f5f3ff;padding:20px 40px;text-align:center;border-bottom:1px solid #ede9fe;">
              <p style="margin:0;font-size:15px;color:#5b21b6;">
                <strong>🎁 Your 7-Day Free Trial is active!</strong> Explore every feature with no commitment.
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 20px;">
              <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.7;">
                Hi <strong>${safeName}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.7;">
                We're thrilled to have you join thousands of students preparing for the
                <strong>PTE Academic exam</strong> with the help of AI. During your free trial
                you get <em>full access</em> to all our practice tools:
              </p>

              <!-- Features -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="padding:8px 12px;background:#f9fafb;border-radius:8px;margin-bottom:8px;display:block;">
                    <table cellpadding="0" cellspacing="0"><tr>
                      <td style="font-size:18px;padding-right:10px;">🧠</td>
                      <td style="font-size:14px;color:#374151;line-height:1.5;"><strong>AI-Powered Practice</strong> — Real exam-like tasks scored by AI</td>
                    </tr></table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:8px 12px;background:#f9fafb;border-radius:8px;">
                    <table cellpadding="0" cellspacing="0"><tr>
                      <td style="font-size:18px;padding-right:10px;">📊</td>
                      <td style="font-size:14px;color:#374151;line-height:1.5;"><strong>Performance Tracking</strong> — Detailed scores and progress insights</td>
                    </tr></table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:8px 12px;background:#f9fafb;border-radius:8px;">
                    <table cellpadding="0" cellspacing="0"><tr>
                      <td style="font-size:18px;padding-right:10px;">📚</td>
                      <td style="font-size:14px;color:#374151;line-height:1.5;"><strong>Vocabulary Builder</strong> — Master high-frequency PTE words</td>
                    </tr></table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:8px 12px;background:#f9fafb;border-radius:8px;">
                    <table cellpadding="0" cellspacing="0"><tr>
                      <td style="font-size:18px;padding-right:10px;">📅</td>
                      <td style="font-size:14px;color:#374151;line-height:1.5;"><strong>Study Planner</strong> — Customised schedule to reach your target score</td>
                    </tr></table>
                  </td>
                </tr>
              </table>

              <h2 style="margin:0 0 20px;font-size:20px;color:#1a1a2e;font-weight:700;text-align:center;">
                🚀 Choose Your Plan &amp; Keep the Momentum
              </h2>
              <p style="margin:0 0 24px;font-size:14px;color:#6b7280;text-align:center;">
                All plans include unlimited access. Cancel anytime.
              </p>

              <!-- Pricing Cards -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <!-- Weekly -->
                  <td width="23%" style="vertical-align:top;padding:0 6px 0 0;">
                    <div style="border:2px solid #e5e7eb;border-radius:12px;padding:18px 14px;text-align:center;">
                      <div style="background:#f3f4f6;color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:3px 8px;border-radius:20px;display:inline-block;margin-bottom:10px;">Weekly</div>
                      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1a1a2e;">Weekly</p>
                      <p style="margin:0 0 2px;font-size:22px;font-weight:800;color:#6c63ff;">A$11</p>
                      <p style="margin:0 0 12px;font-size:11px;color:#9ca3af;text-decoration:line-through;">A$15/week</p>
                      <a href="${upgradeUrl}" style="display:block;background:#6c63ff;color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;padding:8px 0;border-radius:8px;">Get Started</a>
                    </div>
                  </td>
                  <!-- Monthly -->
                  <td width="23%" style="vertical-align:top;padding:0 6px;">
                    <div style="border:2px solid #e5e7eb;border-radius:12px;padding:18px 14px;text-align:center;">
                      <div style="background:#f3f4f6;color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:3px 8px;border-radius:20px;display:inline-block;margin-bottom:10px;">Popular</div>
                      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1a1a2e;">Monthly</p>
                      <p style="margin:0 0 2px;font-size:22px;font-weight:800;color:#6c63ff;">A$21</p>
                      <p style="margin:0 0 12px;font-size:11px;color:#9ca3af;text-decoration:line-through;">A$35/month</p>
                      <a href="${upgradeUrl}" style="display:block;background:#6c63ff;color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;padding:8px 0;border-radius:8px;">Get Started</a>
                    </div>
                  </td>
                  <!-- Quarterly -->
                  <td width="31%" style="vertical-align:top;padding:0 6px;">
                    <div style="border:2px solid #6c63ff;border-radius:12px;padding:18px 14px;text-align:center;position:relative;background:#faf9ff;">
                      <div style="background:#6c63ff;color:#ffffff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:3px 8px;border-radius:20px;display:inline-block;margin-bottom:10px;">⭐ Best Value</div>
                      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1a1a2e;">Quarterly</p>
                      <p style="margin:0 0 2px;font-size:22px;font-weight:800;color:#6c63ff;">A$50</p>
                      <p style="margin:0 0 2px;font-size:11px;color:#9ca3af;text-decoration:line-through;">A$90 / 3 months</p>
                      <p style="margin:0 0 12px;font-size:11px;color:#6c63ff;font-weight:600;">≈ A$16.67/month</p>
                      <a href="${upgradeUrl}" style="display:block;background:#6c63ff;color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;padding:8px 0;border-radius:8px;">Best Deal</a>
                    </div>
                  </td>
                  <!-- Annual -->
                  <td width="23%" style="vertical-align:top;padding:0 0 0 6px;">
                    <div style="border:2px solid #e5e7eb;border-radius:12px;padding:18px 14px;text-align:center;">
                      <div style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:3px 8px;border-radius:20px;display:inline-block;margin-bottom:10px;">Save 50%</div>
                      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1a1a2e;">Annual</p>
                      <p style="margin:0 0 2px;font-size:22px;font-weight:800;color:#6c63ff;">A$175</p>
                      <p style="margin:0 0 12px;font-size:11px;color:#9ca3af;text-decoration:line-through;">A$350/year</p>
                      <a href="${upgradeUrl}" style="display:block;background:#6c63ff;color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;padding:8px 0;border-radius:8px;">Get Started</a>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Main CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
                <tr>
                  <td align="center">
                    <a href="${upgradeUrl}" style="display:inline-block;background:linear-gradient(135deg,#6c63ff,#4f46e5);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 48px;border-radius:50px;letter-spacing:0.5px;">
                      Upgrade My Plan &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:14px;color:#6b7280;text-align:center;line-height:1.6;">
                Have questions? Just reply to this email or visit our
                <a href="${upgradeUrl}" style="color:#6c63ff;text-decoration:none;">support centre</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">
                You're receiving this because you created an account at PTE Ninja
                (<a href="mailto:${safeEmail}" style="color:#9ca3af;">${safeEmail}</a>).
              </p>
              <p style="margin:0;font-size:12px;color:#d1d5db;">
                &copy; ${new Date().getFullYear()} PTE Ninja. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await transport.sendMail({
      from: `PTE Ninja <${fromAddress}>`,
      to: email,
      subject,
      text: textBody,
      html: htmlBody,
    });
    res.json({ success: true, message: "Welcome email sent." });
  } catch (error) {
    console.error("Failed to send welcome email:", error);
    // Return success anyway so signup flow is not interrupted
    res.json({ success: true, message: "Welcome email could not be delivered." });
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

// ─── Gemini AI Proxy Endpoints ────────────────────────────────────────────────
// All Gemini calls are proxied through the server so API keys are never sent to
// the browser.  Each endpoint requires a valid Firebase ID token.

const geminiProxyLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests. Please try again later." },
});

app.post("/api/generate-tts", geminiProxyLimiter, async (req, res) => {
  const authResult = await requireAuth(req, res);
  if (!authResult) return;

  const { text } = req.body as { text: string };
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "text is required." });
  }
  if (serverTTSGeminiKeys.length === 0) {
    return res.status(503).json({ error: "AI service is currently unavailable." });
  }

  try {
    const safeText = sanitizePromptValue(text.trim(), 500);
    if (safeText.length === 0) {
      return res.status(400).json({ error: "text content is required." });
    }
    const response = await serverCallGemini(
      {
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say clearly and naturally: ${safeText}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
        },
      },
      serverTTSGeminiKeys,
      "ttsKeys",
      // Vertex AI does not have gemini-2.5-flash-preview-tts; use gemini-2.0-flash
      // which supports native audio output on the Vertex AI backend.
      "gemini-2.0-flash",
    );

    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) {
      const finishReason = response.candidates?.[0]?.finishReason ?? "unknown";
      console.error(`[TTS] No audio data in response. finishReason=${finishReason}`);
      return res.status(500).json({ error: "No audio data returned from AI." });
    }
    res.json({ audio: base64 });
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXCEEDED") {
      return res.status(503).json({ error: "AI service is temporarily unavailable. Please try again later." });
    }
    console.error(`[TTS] Proxy error (status=${error.status ?? "n/a"})`, error);
    res.status(500).json({ error: "Failed to generate audio." });
  }
});

app.post("/api/analyze-speaking", geminiProxyLimiter, async (req, res) => {
  const authResult = await requireAuth(req, res);
  if (!authResult) return;

  const { audioData, taskType, mimeType = "audio/webm", correctAnswer } = req.body as {
    audioData: string;
    taskType: string;
    mimeType?: string;
    correctAnswer?: string;
  };

  if (!audioData || typeof audioData !== "string") {
    return res.status(400).json({ error: "audioData is required." });
  }
  if (!taskType || typeof taskType !== "string") {
    return res.status(400).json({ error: "taskType is required." });
  }
  if (serverGeminiKeys.length === 0) {
    return res.status(503).json({ error: "AI service is currently unavailable." });
  }

  const cleanMimeType = mimeType.split(";")[0].trim();
  let prompt = `You are a strict PTE Academic Speaking Examiner. Analyze this audio for ${sanitizePromptValue(taskType, 200)}. IMPORTANT: If the audio contains no speech, is completely silent, or contains only background noise without any recognizable words, you MUST set overall, fluency, pronunciation, and content all to 10 and set transcription to "" (empty string). Otherwise, score strictly on PTE Academic criteria (10-90 scale): Content — relevance and completeness of ideas addressing the task; Oral Fluency — naturalness of speech rhythm, smooth pacing, minimal unnatural hesitations or false starts; Pronunciation — clarity, accurate sound production, and intelligibility for a competent English speaker. Apply genuine PTE standards: a mediocre or average response should score in the 40–55 range, a good response in the 60–70 range, and only an excellent near-native response should approach 80–90. Do not inflate scores. Identify specific weaknesses in pauses, rhythm, and mispronounced words.`;
  if (taskType === "Answer Short Question" && correctAnswer) {
    prompt += ` The expected answer is: "${sanitizePromptValue(correctAnswer, 200)}". Please check if the spoken response matches this answer or is a valid synonym.`;
  }

  try {
    const response = await serverCallGemini({
      model: "gemini-2.5-flash-lite",
      contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: cleanMimeType, data: audioData } }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overall: { type: Type.NUMBER },
            fluency: { type: Type.NUMBER },
            pronunciation: { type: Type.NUMBER },
            content: { type: Type.NUMBER },
            transcription: { type: Type.STRING },
            feedback: { type: Type.ARRAY, items: { type: Type.STRING } },
            mispronounced: { type: Type.ARRAY, items: { type: Type.STRING } },
            hesitations: { type: Type.NUMBER },
            pace: { type: Type.STRING },
            stress: { type: Type.STRING },
          },
          required: ["overall", "fluency", "pronunciation", "content", "transcription"],
        },
      },
    });

    const parsed = JSON.parse(response.text ?? "{}");

    // Server-side guard: if Gemini returned empty/blank transcription despite the
    // prompt instruction, it means no speech was detected. Override all scores to the
    // minimum to avoid giving unearned high marks for silence.
    const transcription: string = parsed.transcription ?? "";
    if (transcription.trim().length < 5) {
      parsed.overall = 10;
      parsed.fluency = 10;
      parsed.pronunciation = 10;
      parsed.content = 10;
      parsed.transcription = "";
      parsed.feedback = ["No speech detected. Please record yourself speaking clearly."];
      parsed.mispronounced = [];
      parsed.hesitations = 0;
      parsed.pace = "N/A";
      parsed.stress = "N/A";
    }

    res.json(parsed);
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXCEEDED") {
      return res.status(503).json({ error: "AI service is temporarily unavailable. Please try again later." });
    }
    console.error("Speaking analysis proxy error:", error);
    res.status(500).json({ error: "Failed to analyze speaking." });
  }
});

app.post("/api/analyze-writing", geminiProxyLimiter, async (req, res) => {
  const authResult = await requireAuth(req, res);
  if (!authResult) return;

  const { text, taskType } = req.body as { text: string; taskType: string };

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "text is required." });
  }
  if (!taskType || typeof taskType !== "string") {
    return res.status(400).json({ error: "taskType is required." });
  }
  if (serverGeminiKeys.length === 0) {
    return res.status(503).json({ error: "AI service is currently unavailable." });
  }

  const safeTaskType = sanitizePromptValue(taskType, 200);
  // Sanitize control characters while preserving the essay text (limit to 5000 chars)
  const safeText = sanitizePromptValue(text, 5000);

  try {
    const response = await serverCallGemini({
      model: "gemini-2.5-flash-lite",
      contents: `You are a strict PTE Academic Writing Examiner. Analyze this PTE ${safeTaskType} response: "${safeText}". Score it strictly on the 10-90 PTE Academic scale for Grammar (accuracy and range of grammatical structures), Vocabulary (range and appropriateness of word choice), Spelling (accuracy of spelling), and Content (relevance, completeness, and accuracy relative to the task). A mediocre or average response should score in the 40–55 range, a good response in the 60–70 range, and only an excellent near-native response should approach 80–90. Do not inflate scores. Provide specific, actionable improvement tips and list all grammatical, spelling, vocabulary, and content mistakes found. Return JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overall: { type: Type.NUMBER },
            grammar: { type: Type.NUMBER },
            vocabulary: { type: Type.NUMBER },
            spelling: { type: Type.NUMBER },
            content: { type: Type.NUMBER },
            tips: { type: Type.ARRAY, items: { type: Type.STRING } },
            mistakes: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["overall", "grammar", "vocabulary", "spelling", "content", "tips", "mistakes"],
        },
      },
    });

    res.json(JSON.parse(response.text ?? "{}"));
  } catch (error: any) {
    if (error.message === "GEMINI_QUOTA_EXCEEDED") {
      return res.status(503).json({ error: "AI service is temporarily unavailable. Please try again later." });
    }
    console.error("Writing analysis proxy error:", error);
    res.status(500).json({ error: "Failed to analyze writing." });
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
