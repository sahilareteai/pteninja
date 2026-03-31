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

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV, vercel: !!process.env.VERCEL });
});

// Stripe Payment Intent
app.post("/api/create-payment-intent", async (req, res) => {
  console.log("Received payment intent request:", req.body);
  
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    console.error("Stripe is not configured. STRIPE_SECRET_KEY is missing.");
    return res.status(500).json({ 
      error: "Stripe is not configured on the server. Please add STRIPE_SECRET_KEY to environment variables." 
    });
  }

  const { amount, currency = "aud" } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  try {
    const paymentIntent = await stripeInstance.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log("Payment intent created successfully:", paymentIntent.id);
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
