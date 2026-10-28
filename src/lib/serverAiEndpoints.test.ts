import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../server";

describe("Live Server AI Endpoints (/api/generate-tts and /api/analyze-speaking)", () => {
  describe("POST /api/generate-tts", () => {
    it("rejects when text is missing", async () => {
      const res = await request(app)
        .post("/api/generate-tts")
        .set("X-PTE-App-Platform", "mobile")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("text is required");
    });

    it("accepts mobile platform requests without requiring Firebase ID token", async () => {
      const res = await request(app)
        .post("/api/generate-tts")
        .set("X-PTE-App-Platform", "mobile")
        .set("Origin", "capacitor://localhost")
        .send({ text: "Testing audio speech synthesis" });

      // If keys are valid, status is 200 with audio base64, or 503 if all quotas are currently reached
      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.audio).toBeDefined();
        expect(typeof res.body.audio).toBe("string");
        expect(res.body.audio.length).toBeGreaterThan(50);
      }
      expect(res.status).not.toBe(401);
    }, 15000);
  });

  describe("POST /api/analyze-speaking", () => {
    it("rejects when audioData is missing", async () => {
      const res = await request(app)
        .post("/api/analyze-speaking")
        .set("X-PTE-App-Platform", "mobile")
        .send({ taskType: "Read Aloud" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("audioData is required");
    });

    it("accepts mobile requests and scores audio without 401 Unauthorized", async () => {
      // Generate valid 1-second PCM WAV audio (8000 Hz 16-bit mono sine wave)
      const sampleRate = 8000;
      const numSamples = sampleRate * 1;
      const dataSize = numSamples * 2;
      const buffer = Buffer.alloc(44 + dataSize);
      buffer.write("RIFF", 0);
      buffer.writeUInt32LE(36 + dataSize, 4);
      buffer.write("WAVE", 8);
      buffer.write("fmt ", 12);
      buffer.writeUInt32LE(16, 16);
      buffer.writeUInt16LE(1, 20);
      buffer.writeUInt16LE(1, 22);
      buffer.writeUInt32LE(sampleRate, 24);
      buffer.writeUInt32LE(sampleRate * 2, 28);
      buffer.writeUInt16LE(2, 32);
      buffer.writeUInt16LE(16, 34);
      buffer.write("data", 36);
      buffer.writeUInt32LE(dataSize, 40);
      for (let i = 0; i < numSamples; i++) {
        const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 10000;
        buffer.writeInt16LE(Math.floor(sample), 44 + i * 2);
      }
      const sampleWavBase64 = buffer.toString("base64");

      const res = await request(app)
        .post("/api/analyze-speaking")
        .set("X-PTE-App-Platform", "mobile")
        .set("Origin", "capacitor://localhost")
        .send({
          audioData: sampleWavBase64,
          taskType: "Read Aloud",
          mimeType: "audio/wav",
          correctAnswer: "The quick brown fox jumps over the lazy dog."
        });

      // Status should be 200 with PTE score metrics (or 503 if quota unavailable), but never 401
      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.overall).toBeDefined();
        expect(typeof res.body.overall).toBe("number");
        expect(res.body.fluency).toBeDefined();
        expect(res.body.pronunciation).toBeDefined();
        expect(res.body.content).toBeDefined();
      }
      expect(res.status).not.toBe(401);
    }, 15000);
  });

  describe("POST /api/analyze-writing", () => {
    it("accepts mobile requests and scores writing without 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/analyze-writing")
        .set("X-PTE-App-Platform", "mobile")
        .set("Origin", "capacitor://localhost")
        .send({
          text: "The rapid development of artificial intelligence has significantly transformed modern communication and industry.",
          taskType: "Summarize Written Text"
        });

      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.overall).toBeDefined();
        expect(typeof res.body.overall).toBe("number");
        expect(res.body.grammar).toBeDefined();
        expect(res.body.vocabulary).toBeDefined();
        expect(res.body.spelling).toBeDefined();
        expect(res.body.content).toBeDefined();
      }
      expect(res.status).not.toBe(401);
    }, 15000);
  });
});
