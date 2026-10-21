# PTE Ninja — Production Deployment Guide

This guide provides step-by-step instructions for deploying PTE Ninja to **Vercel** and linking your custom domain (`pteninja.com`).

---

## 1. Initial Vercel Deployment

1. Navigate to the [Vercel Dashboard](https://vercel.com/new).
2. Click **Add New... → Project**.
3. Import the GitHub repository:
   👉 **`https://github.com/pteninja24x7support/pteninja`** (Branch: `main`).
4. **Configure Project Settings**:
   * **Framework Preset**: `Vite` (Auto-detected).
   * **Root Directory**: `./` (Default).
   * **Build Command**: `vite build` (Default).
   * **Output Directory**: `dist` (Default).
   * **Install Command**: `npm install` (Default).
5. Expand **Environment Variables** and enter the production keys documented in Section 3 below.
6. Click **Deploy**.

---

## 2. Custom Domain Setup (`pteninja.com`)

1. In your Vercel Project, go to **Settings → Domains**.
2. Enter `pteninja.com` and click **Add**.
3. Choose the recommended redirect:
   * Redirect `www.pteninja.com` to `pteninja.com` (or vice versa).
4. Update DNS records at your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.):

| Type | Name / Host | Target / Value | TTL |
| :--- | :--- | :--- | :--- |
| **A** | `@` | `76.76.21.21` | Automatic / 300 |
| **CNAME** | `www` | `cname.vercel-dns.com.` | Automatic / 300 |

5. Once DNS propagates (typically 2–15 minutes), Vercel automatically generates a free Let's Encrypt SSL/TLS certificate.

---

## 3. Environment Variables Reference

Add these into **Vercel → Project Settings → Environment Variables**:

### A. Core AI & Google Cloud Credentials
```env
FIREBASE_DATABASE_ID=(default)
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
PREFER_FREE_GEMINI=true
GROQ_API_KEY=YOUR_GROQ_API_KEY
```
> **Important**: Add `FIREBASE_SERVICE_ACCOUNT` as an individual variable. Copy line 13 of `.env` (the complete single-line JSON string starting with `{"type":"service_account",...}`) to preserve JSON integrity.

### B. Payment Gateways
```env
VITE_RAZORPAY_KEY_ID=rzp_test_THbHZDXHYxN0un
RAZORPAY_KEY_ID=rzp_test_THbHZDXHYxN0un
RAZORPAY_KEY_SECRET=YOUR_RAZORPAY_KEY_SECRET
```
*(Swap with `rzp_live` keys when ready to accept real payments).*

### C. Security & Networking
```env
APP_URL=https://pteninja.com
ALLOWED_ORIGINS=https://pteninja.vercel.app,https://pteninja.com,https://localhost,http://localhost,capacitor://localhost
ADMIN_EMAILS=sg.analyst93@gmail.com
UNSUBSCRIBE_SECRET=YOUR_UNSUBSCRIBE_SECRET_32_CHARS
CRON_SECRET=YOUR_CRON_SECRET_32_CHARS
SUPPORT_EMAIL=support@pteninja.com
```

---

## 4. Vercel Cron Configuration

The automated weekly upgrade email system is pre-configured in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/send-weekly-upgrade-emails",
      "schedule": "0 9 * * 1"
    }
  ]
}
```
* **Frequency**: Every Monday at 9:00 AM UTC.
* **Authentication**: Vercel Cron automatically includes `Authorization: Bearer <CRON_SECRET>` in requests to ensure security.
* **Manual Testing**: You can trigger the cron job at any time using:
  ```bash
  curl -X POST https://pteninja.com/api/send-weekly-upgrade-emails \
    -H "Authorization: Bearer e9a4f21b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f"
  ```
