import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.GEMINI_API_KEY = "test_gemini_key";
delete process.env.GROQ_API_KEY;

// ─── Firebase Admin mocks ────────────────────────────────────────────────────
const mockVerifyIdToken    = vi.hoisted(() => vi.fn());
const mockFirestoreDocGet  = vi.hoisted(() => vi.fn());
const mockFirestoreDocDelete = vi.hoisted(() => vi.fn());
const mockFirestoreDocSet    = vi.hoisted(() => vi.fn());
const mockFirestoreDocUpdate = vi.hoisted(() => vi.fn());
const mockFirestoreCollectionGet = vi.hoisted(() => vi.fn());

const mockFirestoreBatchDelete = vi.hoisted(() => vi.fn());
const mockFirestoreBatchUpdate = vi.hoisted(() => vi.fn());
const mockFirestoreBatchSet    = vi.hoisted(() => vi.fn());
const mockFirestoreBatchCommit = vi.hoisted(() => vi.fn());
const mockFirestoreBatch = vi.hoisted(() => vi.fn(() => ({
  delete: mockFirestoreBatchDelete,
  update: mockFirestoreBatchUpdate,
  set: mockFirestoreBatchSet,
  commit: mockFirestoreBatchCommit,
})));

const mockDeleteUser = vi.hoisted(() => vi.fn());
const mockGetUser    = vi.hoisted(() => vi.fn());
const mockGetApps    = vi.hoisted(() => vi.fn());
const mockInitApp    = vi.hoisted(() => vi.fn());

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
    deleteUser: mockDeleteUser,
    getUser: mockGetUser,
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({
        get: mockFirestoreDocGet,
        delete: mockFirestoreDocDelete,
        set: mockFirestoreDocSet,
        update: mockFirestoreDocUpdate,
      }),
      where: () => ({
        limit: () => ({ get: mockFirestoreCollectionGet }),
        get: mockFirestoreCollectionGet,
      }),
      get: mockFirestoreCollectionGet,
    }),
    batch: mockFirestoreBatch,
  }),
  FieldValue: {
    increment: vi.fn((n) => n),
  },
}));

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn().mockReturnValue({}),
  getApps: mockGetApps,
  initializeApp: mockInitApp,
}));

// ─── Stripe Mocks ────────────────────────────────────────────────────────────
const mockPaymentIntentsCreate       = vi.hoisted(() => vi.fn());
const mockPaymentIntentsRetrieve     = vi.hoisted(() => vi.fn());
const mockCustomersCreate            = vi.hoisted(() => vi.fn());
const mockPricesCreate               = vi.hoisted(() => vi.fn());
const mockSubscriptionsCreate        = vi.hoisted(() => vi.fn());
const mockSubscriptionsCancel        = vi.hoisted(() => vi.fn());
const mockSubscriptionsList          = vi.hoisted(() => vi.fn());
const mockSubscriptionsUpdate        = vi.hoisted(() => vi.fn());
const mockSubscriptionsRetrieve      = vi.hoisted(() => vi.fn());
const mockInvoicesRetrieve           = vi.hoisted(() => vi.fn());
const mockBillingPortalSessionsCreate = vi.hoisted(() => vi.fn());
const mockCouponsRetrieve            = vi.hoisted(() => vi.fn());
const mockCouponsCreate              = vi.hoisted(() => vi.fn());

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
      retrieve: mockSubscriptionsRetrieve,
    };
    invoices       = { retrieve: mockInvoicesRetrieve };
    billingPortal  = { sessions: { create: mockBillingPortalSessionsCreate } };
    coupons        = { retrieve: mockCouponsRetrieve, create: mockCouponsCreate };
  }
  return { default: MockStripe };
});

// ─── Nodemailer Mocks ────────────────────────────────────────────────────────
const mockSendMail = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: mockSendMail,
    }),
  },
}));

// ─── Google GenAI Mocks ──────────────────────────────────────────────────────
const mockGenerateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    models = {
      generateContent: mockGenerateContent,
    };
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
    Modality: { AUDIO: "AUDIO" },
    Type: { OBJECT: "OBJECT", NUMBER: "NUMBER", STRING: "STRING", ARRAY: "ARRAY" },
  };
});


// ─── Razorpay Mocks ──────────────────────────────────────────────────────────
const mockRazorpayOrdersCreate = vi.hoisted(() => vi.fn());
vi.mock("razorpay", () => {
  class MockRazorpay {
    orders = {
      create: mockRazorpayOrdersCreate,
    };
    constructor(public options: any) {}
  }
  return { default: MockRazorpay };
});

// Import app after mocks are set up
const { app, serverGeminiKeys, parseServiceAccountJson } = await import("./server.ts");

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

// ─── Health check endpoint ────────────────────────────────────────────────────
describe("GET /api/health", () => {
  it("returns 200 and status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

// ─── Customer Portal endpoint ──────────────────────────────────────────────────
describe("POST /api/customer-portal", () => {
  beforeEach(() => {
    mockBillingPortalSessionsCreate.mockReset();
  });

  it("returns billing portal session URL", async () => {
    mockBillingPortalSessionsCreate.mockResolvedValue({ url: "https://stripe.com/portal/session" });

    const res = await request(app)
      .post("/api/customer-portal")
      .set("Authorization", AUTH_HEADER)
      .send({ customerId: "cus_123", returnUrl: "https://pteninja.com" });

    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://stripe.com/portal/session");
    expect(mockBillingPortalSessionsCreate).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "https://pteninja.com",
    });
  });

  it("returns 400 if customerId is missing", async () => {
    const res = await request(app)
      .post("/api/customer-portal")
      .set("Authorization", AUTH_HEADER)
      .send({ returnUrl: "https://pteninja.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("customerId is required");
  });
});

// ─── Apply Retention Discount endpoint ──────────────────────────────────────────
describe("POST /api/apply-retention-discount", () => {
  beforeEach(() => {
    mockCouponsRetrieve.mockReset();
    mockCouponsCreate.mockReset();
    mockSubscriptionsUpdate.mockReset();
  });

  it("applies a 10% coupon successfully", async () => {
    mockCouponsRetrieve.mockResolvedValue({ id: "PTENINJA_RETENTION_10" });
    mockSubscriptionsUpdate.mockResolvedValue({});

    const res = await request(app)
      .post("/api/apply-retention-discount")
      .set("Authorization", AUTH_HEADER)
      .send({ subscriptionId: "sub_123" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_123", {
      discounts: [{ coupon: "PTENINJA_RETENTION_10" }],
    });
  });

  it("creates coupon if retrieve fails", async () => {
    mockCouponsRetrieve.mockRejectedValue(new Error("Not found"));
    mockCouponsCreate.mockResolvedValue({ id: "PTENINJA_RETENTION_10" });
    mockSubscriptionsUpdate.mockResolvedValue({});

    const res = await request(app)
      .post("/api/apply-retention-discount")
      .set("Authorization", AUTH_HEADER)
      .send({ subscriptionId: "sub_123" });

    expect(res.status).toBe(200);
    expect(mockCouponsCreate).toHaveBeenCalledWith({
      id: "PTENINJA_RETENTION_10",
      percent_off: 10,
      duration: "once",
      name: "10% loyalty discount",
    });
  });
});

// ─── Reactivate Subscription endpoint ───────────────────────────────────────────
describe("POST /api/reactivate-subscription", () => {
  beforeEach(() => {
    mockSubscriptionsUpdate.mockReset();
  });

  it("reactivates a subscription successfully", async () => {
    mockSubscriptionsUpdate.mockResolvedValue({
      cancel_at_period_end: false,
      current_period_end: 1800000000,
    });

    const res = await request(app)
      .post("/api/reactivate-subscription")
      .set("Authorization", AUTH_HEADER)
      .send({ subscriptionId: "sub_123" });

    expect(res.status).toBe(200);
    expect(res.body.cancelAtPeriodEnd).toBe(false);
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_123", {
      cancel_at_period_end: false,
    });
  });
});

// ─── Change Plan endpoint ───────────────────────────────────────────────────────
describe("POST /api/change-plan", () => {
  beforeEach(() => {
    mockSubscriptionsRetrieve.mockReset();
    mockPricesCreate.mockReset();
    mockSubscriptionsUpdate.mockReset();
  });

  it("changes subscription plan successfully", async () => {
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_123",
      items: { data: [{ id: "item_123" }] },
    });
    mockPricesCreate.mockResolvedValue({ id: "price_new" });
    mockSubscriptionsUpdate.mockResolvedValue({
      id: "sub_123",
      status: "active",
      current_period_end: 1900000000,
      cancel_at_period_end: false,
    });

    const res = await request(app)
      .post("/api/change-plan")
      .set("Authorization", AUTH_HEADER)
      .send({
        subscriptionId: "sub_123",
        planId: "monthly",
        planName: "Monthly",
        amount: 2100,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mockPricesCreate).toHaveBeenCalled();
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_123", {
      items: [{ id: "item_123", price: "price_new" }],
      proration_behavior: "create_prorations",
    });
  });
});

// ─── Sync Subscription Status endpoint ─────────────────────────────────────────
describe("POST /api/sync-subscription", () => {
  beforeEach(() => {
    mockSubscriptionsRetrieve.mockReset();
    mockSubscriptionsList.mockReset();
  });

  it("syncs subscription by subscriptionId successfully", async () => {
    mockSubscriptionsRetrieve.mockResolvedValue({
      status: "active",
      current_period_end: 1800000000,
      cancel_at_period_end: false,
    });

    const res = await request(app)
      .post("/api/sync-subscription")
      .set("Authorization", AUTH_HEADER)
      .send({ subscriptionId: "sub_123" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_123");
  });

  it("resolves and syncs subscription by customerId", async () => {
    mockSubscriptionsList.mockResolvedValue({ data: [{ id: "sub_resolved" }] });
    mockSubscriptionsRetrieve.mockResolvedValue({
      status: "active",
      current_period_end: 1800000000,
      cancel_at_period_end: false,
    });

    const res = await request(app)
      .post("/api/sync-subscription")
      .set("Authorization", AUTH_HEADER)
      .send({ customerId: "cus_123" });

    expect(res.status).toBe(200);
    expect(res.body.subscriptionId).toBe("sub_resolved");
    expect(mockSubscriptionsList).toHaveBeenCalledWith({
      customer: "cus_123",
      status: "all",
      limit: 1,
    });
  });
});

// ─── Check Email Availability endpoint ──────────────────────────────────────────
describe("POST /api/check-email-availability", () => {
  beforeEach(() => {
    mockFirestoreCollectionGet.mockReset();
  });

  it("returns available: true if email does not exist", async () => {
    mockFirestoreCollectionGet.mockResolvedValue({ empty: true });

    const res = await request(app)
      .post("/api/check-email-availability")
      .send({ email: "newuser@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
  });

  it("returns available: false if email exists", async () => {
    mockFirestoreCollectionGet.mockResolvedValue({
      empty: false,
      docs: [{ data: () => ({ accessType: "user" }) }],
    });

    const res = await request(app)
      .post("/api/check-email-availability")
      .send({ email: "existing@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
  });
});

// ─── Support Chat endpoint ─────────────────────────────────────────────────────
describe("POST /api/support-chat", () => {
  let savedGroqKey: string | undefined;

  beforeEach(() => {
    savedGroqKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    mockGenerateContent.mockReset();
    mockGetApps.mockReturnValue([{}]); // so getAdminApp returns truthy
    mockFirestoreDocSet.mockReset();
    for (const k of serverGeminiKeys) {
      k.exhaustedUntil = 0;
      k.consecutiveExhaustions = 0;
    }
  });

  afterEach(() => {
    if (savedGroqKey !== undefined) {
      process.env.GROQ_API_KEY = savedGroqKey;
    }
  });

  it("returns AI response successfully", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "Hello! How can I help you with PTE today?",
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    });

    const res = await request(app)
      .post("/api/support-chat")
      .send({
        message: "Tell me about Read Aloud",
        history: [],
        userDetails: { name: "John", email: "john@example.com", issueType: "Speaking" },
      });

    expect(res.status).toBe(200);
    expect(res.body.response).toBe("Hello! How can I help you with PTE today?");
    expect(mockGenerateContent).toHaveBeenCalled();
  }, 15000);
});

// ─── Support Ticket endpoint ───────────────────────────────────────────────────
describe("POST /api/support-ticket", () => {
  beforeEach(() => {
    mockSendMail.mockReset();
  });

  it("sends support emails and returns ticketId", async () => {
    vi.stubEnv("SUPPORT_EMAIL", "support@pteninja.com");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_USER", "smtp_user");
    vi.stubEnv("SMTP_PASS", "smtp_pass");

    mockSendMail.mockResolvedValue({ messageId: "mail_sent" });

    const res = await request(app)
      .post("/api/support-ticket")
      .send({
        userDetails: {
          name: "John Doe",
          email: "john@example.com",
          issueType: "Billing",
          description: "Stripe error",
        },
        conversation: "User: hello\nModel: hi",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ticketId).toBeDefined();
    expect(mockSendMail).toHaveBeenCalled();
  });
});

// ─── Gemini Quota Alert endpoint ────────────────────────────────────────────────
describe("POST /api/gemini-quota-alert", () => {
  beforeEach(() => {
    mockSendMail.mockReset();
  });

  it("sends quota alert email successfully", async () => {
    vi.stubEnv("SUPPORT_EMAIL", "support@pteninja.com");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_USER", "smtp_user");
    vi.stubEnv("SMTP_PASS", "smtp_pass");
    mockSendMail.mockResolvedValue({});

    const res = await request(app).post("/api/gemini-quota-alert");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockSendMail).toHaveBeenCalled();
  });
});

// ─── Unsubscribe endpoint ──────────────────────────────────────────────────────
describe("GET /api/unsubscribe", () => {
  beforeEach(() => {
    mockGetApps.mockReturnValue([{}]);
    mockFirestoreCollectionGet.mockReset();
    mockFirestoreBatch.mockReturnValue({
      delete: vi.fn(),
      set: vi.fn(),
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue({}),
    });
  });

  it("renders success page for valid unsub token", async () => {
    // Generate valid token for testing
    // Using default unsubscribe secret 'dev-unsubscribe-secret-change-in-prod'
    const crypto = await import("node:crypto");
    const email = "user@example.com";
    const token = crypto.createHmac("sha256", "dev-unsubscribe-secret-change-in-prod")
      .update(email)
      .digest("hex");
    const encodedEmail = Buffer.from(email).toString("base64url");

    mockFirestoreCollectionGet.mockResolvedValue({
      empty: false,
      docs: [{ ref: {} }],
    });

    const res = await request(app)
      .get(`/api/unsubscribe?e=${encodedEmail}&t=${token}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("unsubscribed");
  });
});

// ─── Welcome Email endpoint ────────────────────────────────────────────────────
describe("POST /api/send-welcome-email", () => {
  beforeEach(() => {
    mockSendMail.mockReset();
  });

  it("sends welcome email successfully", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_USER", "smtp_user");
    vi.stubEnv("SMTP_PASS", "smtp_pass");
    mockSendMail.mockResolvedValue({});

    const res = await request(app)
      .post("/api/send-welcome-email")
      .set("Authorization", AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalled();
  });
});

// ─── parseServiceAccountJson utility ──────────────────────────────────────────
describe("parseServiceAccountJson", () => {
  it("parses valid JSON without quotes", () => {
    const parsed = parseServiceAccountJson('{"project_id":"pteninja-prod"}');
    expect(parsed).toEqual({ project_id: "pteninja-prod" });
  });

  it("strips outer single quotes correctly", () => {
    const parsed = parseServiceAccountJson('\'{"project_id":"pteninja-prod"}\'');
    expect(parsed).toEqual({ project_id: "pteninja-prod" });
  });

  it("strips outer double quotes correctly", () => {
    const parsed = parseServiceAccountJson('"{\\"project_id\\":\\"pteninja-prod\\"}"');
    expect(parsed).toEqual({ project_id: "pteninja-prod" });
  });

  it("returns null for empty or undefined input", () => {
    expect(parseServiceAccountJson("")).toBeNull();
    expect(parseServiceAccountJson(undefined)).toBeNull();
  });
});

// ─── Razorpay Order Endpoint ──────────────────────────────────────────────────
describe("POST /api/create-razorpay-order", () => {
  beforeEach(() => {
    mockRazorpayOrdersCreate.mockReset();
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_mock_123");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "mock_secret_abc");
  });

  it("returns 400 for invalid or missing planId", async () => {
    const res = await request(app)
      .post("/api/create-razorpay-order")
      .set("Authorization", AUTH_HEADER)
      .send({ planId: "nonexistent_plan", amount: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unknown plan ID");
  });

  it("returns 400 for amount less than minimum (1 INR / 100 paise)", async () => {
    const res = await request(app)
      .post("/api/create-razorpay-order")
      .set("Authorization", AUTH_HEADER)
      .send({ planId: "monthly", amount: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Minimum amount is 1 INR");
  });

  it("creates order and returns order details with dynamic razorpayKeyId", async () => {
    mockRazorpayOrdersCreate.mockResolvedValue({
      id: "order_mock_test_789",
      amount: 139600,
      currency: "INR",
      status: "created",
    });

    const res = await request(app)
      .post("/api/create-razorpay-order")
      .set("Authorization", AUTH_HEADER)
      .send({ planId: "monthly", amount: 1396, currency: "INR" });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("order_mock_test_789");
    expect(res.body.razorpayKeyId).toBe("rzp_test_mock_123");
    expect(mockRazorpayOrdersCreate).toHaveBeenCalled();
  });

  it("handles Razorpay 401 authentication errors with clear message", async () => {
    mockRazorpayOrdersCreate.mockRejectedValue({
      statusCode: 401,
      error: {
        code: "BAD_REQUEST_ERROR",
        description: "Authentication failed",
      },
    });

    const res = await request(app)
      .post("/api/create-razorpay-order")
      .set("Authorization", AUTH_HEADER)
      .send({ planId: "monthly", amount: 1396, currency: "INR" });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Razorpay authentication failed");
  });
});

// ─── Razorpay Verify Payment Endpoint ─────────────────────────────────────────
describe("POST /api/verify-razorpay-payment", () => {
  beforeEach(() => {
    mockFirestoreDocSet.mockReset();
    vi.stubEnv("RAZORPAY_KEY_SECRET", "mock_secret_xyz");
  });

  it("returns 400 for missing verification fields", async () => {
    const res = await request(app)
      .post("/api/verify-razorpay-payment")
      .set("Authorization", AUTH_HEADER)
      .send({ planId: "monthly" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing verification data");
  });

  it("returns 400 for invalid signature", async () => {
    const res = await request(app)
      .post("/api/verify-razorpay-payment")
      .set("Authorization", AUTH_HEADER)
      .send({
        razorpay_order_id: "order_123",
        razorpay_payment_id: "pay_123",
        razorpay_signature: "invalid_sig_hex_1234567890abcdef",
        planId: "monthly",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid signature");
  });

  it("verifies valid signature and activates user subscription in Firestore", async () => {
    const crypto = await import("node:crypto");
    const orderId = "order_abc_123";
    const paymentId = "pay_xyz_456";
    const secret = "mock_secret_xyz";
    const validSignature = crypto.createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    mockFirestoreDocSet.mockResolvedValue({});

    const res = await request(app)
      .post("/api/verify-razorpay-payment")
      .set("Authorization", AUTH_HEADER)
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature,
        planId: "monthly",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockFirestoreDocSet).toHaveBeenCalled();
  });
});

// ─── AdMob / IAB app-ads.txt verification ─────────────────────────────────────
describe("GET /app-ads.txt & /ads.txt", () => {
  it("serves app-ads.txt with correct Content-Type and AdMob publisher record", async () => {
    const res = await request(app).get("/app-ads.txt");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("google.com, pub-9025413323620577, DIRECT, f08c47fec0942fa0");
  });

  it("serves ads.txt with correct Content-Type and AdMob publisher record", async () => {
    const res = await request(app).get("/ads.txt");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("google.com, pub-9025413323620577, DIRECT, f08c47fec0942fa0");
  });
});


