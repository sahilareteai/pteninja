# PTE Ninja — Master Operations Guide

This operational manual documents day-to-day management, platform architecture, monitoring, troubleshooting, and failover runbooks for **PTE Ninja**.

---

## 1. System Architecture Overview

```mermaid
flowchart TD
    ClientWeb[Web Client - React/Vite] -->|fetch /api/*| VercelAPI[Vercel Serverless / Express]
    ClientAndroid[Android App - Capacitor] -->|Native Fetch Interceptor| VercelAPI
    ClientiOS[iOS App - Capacitor] -->|Native Fetch Interceptor| VercelAPI

    subgraph Authentication & Database
        VercelAPI -->|Firebase Admin SDK| FBAuth[Firebase Auth - pteninja-prod]
        VercelAPI -->|Firestore Admin| FBDb[Firestore (default) - pteninja-prod]
    end

    subgraph AI Engine Hierarchy
        VercelAPI -->|Tier 1: 1500 calls/day FREE| GemFree[Google AI Studio: gemini-3.5-flash-lite]
        VercelAPI -->|Tier 2: $300 GCP Credit| VtxAI[Vertex AI: gemini-2.5-flash & TTS]
        VercelAPI -->|Tier 3: Free 750ms Fast Engine| Groq[Groq AI: qwen/qwen3.8-27b]
    end

    subgraph Payments & Notifications
        VercelAPI --> Razorpay[Razorpay Gateway]
        VercelAPI --> Stripe[Stripe Gateway]
        VercelAPI --> Mailer[Nodemailer / Gmail SMTP]
    end
```

---

## 2. AI Engine Operations & Quota Management

PTE Ninja runs a **3-tier hierarchical AI engine**:

| Tier | Engine | Model | Cost / Quota | Primary Role |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | **Google AI Studio** | `gemini-3.5-flash-lite` | **1,500 calls/day FREE** | Essay evaluation, speaking grammar & vocabulary |
| **Tier 2** | **Vertex AI (GCP)** | `gemini-2.5-flash` / `gemini-2.5-flash-preview-tts` | **$300 GCP Credit** (~1B tokens) | Native audio acoustics, pronunciation scoring & TTS voice |
| **Tier 3** | **Groq Cloud** | `qwen/qwen3.8-27b` | **Free Tier** (14,400 calls/day) | Ultra-fast (~750ms) writing scoring & customer chat |

### Operational Rules:
1. **`PREFER_FREE_GEMINI=true`**: Tells the server to consume the 1,500 daily free requests from `GEMINI_API_KEY` before drawing from your $300 Vertex AI credit.
2. **Automatic Failover**:
   * If Tier 1 hits HTTP 429 (quota exhausted), the server immediately rotates to Tier 2 (Vertex AI).
   * If Tier 2 experiences momentary spikes (HTTP 503), it retries twice, then falls over to Groq Whisper + LLM.
   * Students never experience downtime or interruption.

---

## 3. Daily Operations & Health Checklist

| Frequency | Check Item | How to Verify | Normal Threshold |
| :--- | :--- | :--- | :--- |
| **Daily** | Vertex AI Credit Consumption | [Google Cloud Billing Console](https://console.cloud.google.com/billing) | Consuming from $300 credit; $0 out-of-pocket |
| **Daily** | Vercel Serverless Logs | [Vercel Deployment Logs](https://vercel.com/dashboard) | 200 OK across `/api/analyze-speaking` & `/api/analyze-writing` |
| **Weekly** | Firestore Database Backups | Run `npm run migrate:db` or inspect `backups/` | Complete JSON snapshot matches document count |
| **Weekly** | Automated Upgrade Cron | Check `/api/send-weekly-upgrade-emails` execution | Runs every Monday at 9:00 AM UTC |
| **Monthly** | Razorpay Reconciliation | [Razorpay Dashboard](https://dashboard.razorpay.com/) | Captured payments match Firestore `users` plan status |

---

## 4. Emergency Runbooks

### Runbook A: Adding a New Backup Gemini API Key
If you need to add additional Gemini keys for higher free quota:
1. Open [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Generate a new key in a project with no billing attached.
3. In Vercel Project Settings (or local `.env`), add:
   ```env
   GEMINI_API_KEY_2=AIzaSy...new-key
   GEMINI_API_KEY_3=AIzaSy...another-key
   ```
4. The server automatically pools up to 10 keys (`GEMINI_API_KEY` through `GEMINI_API_KEY_10`) and rotates through them with exponential backoff on quota limits.

### Runbook B: Switching Razorpay from Test to Live
1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com/).
2. Switch toggle in top header from **Test Mode** to **Live Mode**.
3. Go to **Settings → API Keys → Generate Key**.
4. In Vercel Environment Variables:
   * Update `VITE_RAZORPAY_KEY_ID` to `rzp_live_...`
   * Update `RAZORPAY_KEY_ID` to `rzp_live_...`
   * Update `RAZORPAY_KEY_SECRET` to your live secret.
5. Redeploy the latest commit in Vercel to bake `VITE_RAZORPAY_KEY_ID` into the frontend bundle.

### Runbook C: Disaster Recovery Database Restore
If user or mock test data is accidentally deleted or corrupted:
1. Locate the latest backup in `backups/firestore_backup_YYYY-MM-DD.json`.
2. Run the migration script pointing to the restore target:
   ```bash
   node scripts/migrate.mjs
   ```
3. To restore Auth users with preserved UIDs, emails, and password hashes:
   ```bash
   node scripts/migrate-auth.mjs
   ```
4. All 40 accounts and Firestore collections will be restored with zero data loss.

---

## 5. Escalation Contacts & Repositories

* **Production Web App**: `https://pteninja.com`
* **Vercel Project**: `https://vercel.com/` (Project: `pteninja`)
* **GitHub Repository**: `https://github.com/pteninja24x7support/pteninja.git` (Branch: `main`)
* **Google Cloud Project**: `pteninja-prod` (`#352036646207`)
* **Support Email Destination**: `support@pteninja.com`
