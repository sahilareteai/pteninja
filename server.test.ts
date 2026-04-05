import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Firebase Admin mocks (hoisted so vi.mock can use them) ───────────────────
const mockVerifyIdToken  = vi.hoisted(() => vi.fn());
const mockFirestoreDocGet = vi.hoisted(() => vi.fn());
const mockGetApps        = vi.hoisted(() => vi.fn());
const mockInitApp        = vi.hoisted(() => vi.fn());

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({ get: mockFirestoreDocGet }),
      where: () => ({ limit: () => ({ get: mockFirestoreDocGet }) }),
    }),
  }),
}));

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn().mockReturnValue({}),
  getApps: mockGetApps,
  initializeApp: mockInitApp,
}));

// Use vi.hoisted so the mock functions are available when vi.mock is hoisted
const mockPaymentIntentsCreate   = vi.hoisted(() => vi.fn());
const mockPaymentIntentsRetrieve = vi.hoisted(() => vi.fn());
const mockCustomersCreate        = vi.hoisted(() => vi.fn());
const mockPricesCreate           = vi.hoisted(() => vi.fn());
const mockSubscriptionsCreate    = vi.hoisted(() => vi.fn());
const mockSubscriptionsCancel    = vi.hoisted(() => vi.fn());
const mockSubscriptionsList      = vi.hoisted(() => vi.fn());
const mockSubscriptionsUpdate    = vi.hoisted(() => vi.fn());
const mockInvoicesRetrieve       = vi.hoisted(() => vi.fn());

vi.mock("stripe", () => {
  class MockStripe {
    paymentIntents = { create: mockPaymentIntentsCreate, retrieve: mockPaymentIntentsRetrieve };
    customers      = { create: mockCustomersCreate };
    prices         = { create: mockPricesCreate };
    subscriptions  = {
      create: mockSubscriptionsCreate,
      cancel: mockSubscriptionsCancel,
      list:   mockSubscriptionsList,
      update: mockSubscriptionsUpdate,
    };
    invoices       = { retrieve: mockInvoicesRetrieve };
  }
  return { default: MockStripe };
});

// Import app after mocks are set up
const { app } = await import("./server.ts");

// ─── Global Firebase auth setup ───────────────────────────────────────────────
// All tests run with a valid auth token. The Firestore user doc intentionally
// has no stripeSubscriptionId/stripeCustomerId set so the ownership check is
// skipped (first-use / new-user scenario). Override per-test as needed.
beforeEach(() => {
  vi.stubEnv("FIREBASE_SERVICE_ACCOUNT", JSON.stringify({ project_id: "test" }));
  mockGetApps.mockReturnValue([]);
  mockInitApp.mockReturnValue({});
  mockVerifyIdToken.mockResolvedValue({ uid: "test_user", email: "user@example.com" });
  mockFirestoreDocGet.mockResolvedValue({ exists: true, data: () => ({}) });
});

const AUTH_HEADER = "Bearer fake_token";

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
      .set("Authorization", AUTH_HEADER)
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
      .set("Authorization", AUTH_HEADER)
      .send({ amount: 500, currency: "usd" });

    expect(res.status).toBe(200);
    const callArg = mockPaymentIntentsCreate.mock.calls[0][0];
    expect(callArg).not.toHaveProperty("receipt_email");
  });

  it("returns 400 for missing amount", async () => {
    const res = await request(app)
      .post("/api/create-payment-intent")
      .set("Authorization", AUTH_HEADER)
      .send({ currency: "aud" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid amount");
  });

  it("returns 400 for zero amount", async () => {
    const res = await request(app)
      .post("/api/create-payment-intent")
      .set("Authorization", AUTH_HEADER)
      .send({ amount: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid amount");
  });

  it("returns 400 when Stripe throws an error", async () => {
    mockPaymentIntentsCreate.mockRejectedValue(new Error("Card declined"));

    const res = await request(app)
      .post("/api/create-payment-intent")
      .set("Authorization", AUTH_HEADER)
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
    mockSubscriptionsList.mockReset();
    mockSubscriptionsUpdate.mockReset();
    mockPaymentIntentsRetrieve.mockReset();
    mockInvoicesRetrieve.mockReset();

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

    const res = await request(app).post("/api/create-subscription").set("Authorization", AUTH_HEADER).send(validBody);

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
      .set("Authorization", AUTH_HEADER)
      .send({ ...validBody, existingCustomerId: "cus_existing" });

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBe("pi_secret_existing");
    expect(res.body.customerId).toBe("cus_existing");
    expect(mockCustomersCreate).not.toHaveBeenCalled();
  });

  it("falls back to paymentIntents.retrieve when payment_intent is a string ID (expand skipped)", async () => {
    // Stripe sometimes returns payment_intent as a plain string ID even when
    // expand was requested (e.g. for recently-settled invoices).
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_fallback",
      status: "incomplete",
      current_period_end: 1234567890,
      cancel_at_period_end: false,
      latest_invoice: {
        payment_intent: "pi_string_id", // unexpanded string
      },
    });
    mockPaymentIntentsRetrieve.mockResolvedValue({ client_secret: "pi_fetched_secret" });

    const res = await request(app).post("/api/create-subscription").set("Authorization", AUTH_HEADER).send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBe("pi_fetched_secret");
    expect(mockPaymentIntentsRetrieve).toHaveBeenCalledWith("pi_string_id");
  });

  it("falls back to invoices.retrieve when latest_invoice is a plain string ID (expand not applied)", async () => {
    // Stripe returns latest_invoice as a string (not expanded) in some edge cases.
    // The code must retrieve the invoice explicitly to get the payment_intent.
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_invoice_string",
      status: "incomplete",
      current_period_end: 1234567890,
      cancel_at_period_end: false,
      latest_invoice: "in_string_id", // string — not expanded
    });
    mockInvoicesRetrieve.mockResolvedValue({
      payment_intent: { client_secret: "pi_from_invoice" },
    });

    const res = await request(app).post("/api/create-subscription").set("Authorization", AUTH_HEADER).send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBe("pi_from_invoice");
    expect(mockInvoicesRetrieve).toHaveBeenCalledWith("in_string_id", expect.objectContaining({ expand: expect.arrayContaining(["payment_intent"]) }));
    expect(mockPaymentIntentsRetrieve).not.toHaveBeenCalled();
  });

  it("falls back to invoices.retrieve then paymentIntents.retrieve when both expand steps are strings", async () => {
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_double_fallback",
      status: "incomplete",
      current_period_end: 1234567890,
      cancel_at_period_end: false,
      latest_invoice: "in_double_id",
    });
    mockInvoicesRetrieve.mockResolvedValue({
      payment_intent: "pi_double_id", // invoice returned but PI is still a string
    });
    mockPaymentIntentsRetrieve.mockResolvedValue({ client_secret: "pi_double_secret" });

    const res = await request(app).post("/api/create-subscription").set("Authorization", AUTH_HEADER).send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBe("pi_double_secret");
    expect(mockInvoicesRetrieve).toHaveBeenCalledWith("in_double_id", expect.anything());
    expect(mockPaymentIntentsRetrieve).toHaveBeenCalledWith("pi_double_id");
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
      .set("Authorization", AUTH_HEADER)
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

    const res = await request(app).post("/api/create-subscription").set("Authorization", AUTH_HEADER).send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/could not be initialised/i);
    expect(mockSubscriptionsCancel).toHaveBeenCalledWith("sub_bad");
  });

  it("returns 400 for unknown planId", async () => {
    const res = await request(app)
      .post("/api/create-subscription")
      .set("Authorization", AUTH_HEADER)
      .send({ ...validBody, planId: "unknown_plan" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Unknown plan ID");
  });

  it("returns 400 for missing amount", async () => {
    const res = await request(app)
      .post("/api/create-subscription")
      .set("Authorization", AUTH_HEADER)
      .send({ planId: "monthly", planName: "Monthly", currency: "aud" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid plan or amount");
  });
});

// ─── Cancel subscription endpoint ─────────────────────────────────────────────
describe("POST /api/cancel-subscription", () => {
  const cancelledSub = {
    id: "sub_cancel",
    status: "active",
    current_period_end: 1800000000,
    cancel_at_period_end: true,
  };

  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    mockSubscriptionsUpdate.mockReset();
    mockSubscriptionsList.mockReset();
    mockSubscriptionsUpdate.mockResolvedValue(cancelledSub);
  });

  it("cancels by subscriptionId when provided", async () => {
    const res = await request(app)
      .post("/api/cancel-subscription")
      .set("Authorization", AUTH_HEADER)
      .send({ subscriptionId: "sub_cancel" });

    expect(res.status).toBe(200);
    expect(res.body.cancelAtPeriodEnd).toBe(true);
    expect(res.body.subscriptionId).toBe("sub_cancel");
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_cancel", { cancel_at_period_end: true });
    expect(mockSubscriptionsList).not.toHaveBeenCalled();
  });

  it("looks up subscription by customerId when subscriptionId is missing", async () => {
    mockSubscriptionsList.mockResolvedValue({ data: [{ id: "sub_found" }] });
    mockSubscriptionsUpdate.mockResolvedValue({ ...cancelledSub, id: "sub_found" });

    const res = await request(app)
      .post("/api/cancel-subscription")
      .set("Authorization", AUTH_HEADER)
      .send({ customerId: "cus_lookup" });

    expect(res.status).toBe(200);
    expect(res.body.subscriptionId).toBe("sub_found");
    expect(mockSubscriptionsList).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_lookup", status: "active" })
    );
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_found", { cancel_at_period_end: true });
  });

  it("returns 400 when neither subscriptionId nor customerId is provided", async () => {
    const res = await request(app)
      .post("/api/cancel-subscription")
      .set("Authorization", AUTH_HEADER)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subscriptionId is required/i);
  });

  it("returns 400 when customerId is provided but no active subscription found", async () => {
    mockSubscriptionsList.mockResolvedValue({ data: [] });

    const res = await request(app)
      .post("/api/cancel-subscription")
      .set("Authorization", AUTH_HEADER)
      .send({ customerId: "cus_empty" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subscriptionId is required/i);
  });
});
