import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Use vi.hoisted so the mock function is available when vi.mock is hoisted
const mockPaymentIntentsCreate = vi.hoisted(() => vi.fn());

vi.mock("stripe", () => {
  class MockStripe {
    paymentIntents = {
      create: mockPaymentIntentsCreate,
    };
  }
  return { default: MockStripe };
});

// Import app after mocks are set up
const { app } = await import("./server.ts");

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
