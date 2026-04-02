import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Use vi.hoisted so the mock functions are available when vi.mock is hoisted
const mockPaymentIntentsCreate = vi.hoisted(() => vi.fn());
const mockCustomersCreate      = vi.hoisted(() => vi.fn());
const mockPricesCreate         = vi.hoisted(() => vi.fn());
const mockSubscriptionsCreate  = vi.hoisted(() => vi.fn());
const mockSubscriptionsCancel  = vi.hoisted(() => vi.fn());

vi.mock("stripe", () => {
  class MockStripe {
    paymentIntents = { create: mockPaymentIntentsCreate };
    customers      = { create: mockCustomersCreate };
    prices         = { create: mockPricesCreate };
    subscriptions  = { create: mockSubscriptionsCreate, cancel: mockSubscriptionsCancel };
  }
  return { default: MockStripe };
});

// Import app after mocks are set up
const { app } = await import("./server.ts");

// ─── Legacy PaymentIntent endpoint ────────────────────────────────────────────
describe("POST /api/create-payment-intent", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    mockPaymentIntentsCreate.mockReset();
  });

  it("passes receipt_email to Stripe when provided", async () => {
    mockPaymentIntentsCreate.mockResolvedValue({
      id: "pi_test",
      client_secret: "pi_test_secret",
    });

    const res = await request(app)
      .post("/api/create-payment-intent")
      .send({ amount: 1000, currency: "aud", receipt_email: "user@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBe("pi_test_secret");
    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ receipt_email: "user@example.com" })
    );
  });

  it("omits receipt_email from Stripe when not provided", async () => {
    mockPaymentIntentsCreate.mockResolvedValue({
      id: "pi_test2",
      client_secret: "pi_test2_secret",
    });

    const res = await request(app)
      .post("/api/create-payment-intent")
      .send({ amount: 500, currency: "usd" });

    expect(res.status).toBe(200);
    const callArg = mockPaymentIntentsCreate.mock.calls[0][0];
    expect(callArg).not.toHaveProperty("receipt_email");
  });

  it("returns 400 for missing amount", async () => {
    const res = await request(app)
      .post("/api/create-payment-intent")
      .send({ currency: "aud" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid amount");
  });

  it("returns 400 for zero amount", async () => {
    const res = await request(app)
      .post("/api/create-payment-intent")
      .send({ amount: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid amount");
  });

  it("returns 400 when Stripe throws an error", async () => {
    mockPaymentIntentsCreate.mockRejectedValue(new Error("Card declined"));

    const res = await request(app)
      .post("/api/create-payment-intent")
      .send({ amount: 1000, currency: "aud" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Card declined");
  });
});

// ─── Subscription endpoint ─────────────────────────────────────────────────────
describe("POST /api/create-subscription", () => {
  const validBody = {
    planId: "monthly",
    planName: "Monthly",
    amount: 2100,
    currency: "aud",
    email: "user@example.com",
  };

  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    mockCustomersCreate.mockReset();
    mockPricesCreate.mockReset();
    mockSubscriptionsCreate.mockReset();
    mockSubscriptionsCancel.mockReset();

    // Default stubs
    mockCustomersCreate.mockResolvedValue({ id: "cus_test" });
    mockPricesCreate.mockResolvedValue({ id: "price_test" });
  });

  it("returns clientSecret for a new customer (normal incomplete flow)", async () => {
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_test",
      status: "incomplete",
      current_period_end: 1234567890,
      cancel_at_period_end: false,
      latest_invoice: {
        payment_intent: { client_secret: "pi_secret_123", status: "requires_payment_method" },
      },
    });

    const res = await request(app).post("/api/create-subscription").send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBe("pi_secret_123");
    expect(res.body.subscriptionId).toBe("sub_test");
    expect(res.body.immediatelyActive).toBeUndefined();
    expect(mockCustomersCreate).toHaveBeenCalledOnce();
  });

  it("reuses existingCustomerId and skips customer creation", async () => {
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_existing",
      status: "incomplete",
      current_period_end: 9999999999,
      cancel_at_period_end: false,
      latest_invoice: {
        payment_intent: { client_secret: "pi_secret_existing" },
      },
    });

    const res = await request(app)
      .post("/api/create-subscription")
      .send({ ...validBody, existingCustomerId: "cus_existing" });

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBe("pi_secret_existing");
    expect(res.body.customerId).toBe("cus_existing");
    expect(mockCustomersCreate).not.toHaveBeenCalled();
  });

  it("returns immediatelyActive when subscription is already active (returning customer with saved card)", async () => {
    // Simulates returning customer whose saved card was auto-charged: Stripe
    // immediately transitions subscription to 'active' and payment_intent is
    // either a string ID (unexpanded) or has no client_secret.
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_active",
      status: "active",
      current_period_end: 1700000000,
      cancel_at_period_end: false,
      latest_invoice: {
        payment_intent: "pi_already_charged", // unexpanded string — no client_secret
      },
    });

    const res = await request(app)
      .post("/api/create-subscription")
      .send({ ...validBody, existingCustomerId: "cus_returning" });

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBeNull();
    expect(res.body.immediatelyActive).toBe(true);
    expect(res.body.subscriptionId).toBe("sub_active");
    expect(res.body.customerId).toBe("cus_returning");
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled(); // must NOT cancel the active sub
  });

  it("cancels orphaned subscription and returns 500 when status is unexpected", async () => {
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_bad",
      status: "incomplete", // incomplete but no payment_intent → unexpected
      current_period_end: 1700000000,
      cancel_at_period_end: false,
      latest_invoice: { payment_intent: null },
    });
    mockSubscriptionsCancel.mockResolvedValue({});

    const res = await request(app).post("/api/create-subscription").send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/could not be initialised/i);
    expect(mockSubscriptionsCancel).toHaveBeenCalledWith("sub_bad");
  });

  it("returns 400 for unknown planId", async () => {
    const res = await request(app)
      .post("/api/create-subscription")
      .send({ ...validBody, planId: "unknown_plan" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Unknown plan ID");
  });

  it("returns 400 for missing amount", async () => {
    const res = await request(app)
      .post("/api/create-subscription")
      .send({ planId: "monthly", planName: "Monthly", currency: "aud" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid plan or amount");
  });
});

