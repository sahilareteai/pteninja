import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getStoreKit,
  purchaseAppleSubscription,
  queryAppleProducts,
  restoreApplePurchases,
  presentAppleCodeRedemptionSheet,
  APPLE_SUBSCRIPTION_MAP,
} from './appleBilling';
import { safeResumeAudioContext } from '../App';

describe('Apple StoreKit 2 & Audio Playback Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof (globalThis as any).window === 'undefined') {
      (globalThis as any).window = globalThis;
    }
  });

  describe('Apple StoreKit Plugin Bridge & Pricing Plans', () => {
    it('defines valid App Store product IDs for all standard plans', () => {
      expect(APPLE_SUBSCRIPTION_MAP.weekly.productId).toBe('pte_ninja_weekly');
      expect(APPLE_SUBSCRIPTION_MAP.monthly.productId).toBe('pte_ninja_monthly');
      expect(APPLE_SUBSCRIPTION_MAP.quarterly.productId).toBe('pte_ninja_quarterly');
      expect(APPLE_SUBSCRIPTION_MAP.annual.productId).toBe('pte_ninja_annual');
    });

    it('falls back to window.Capacitor.Plugins.AppleStoreKit if directly exported on window', () => {
      const mockPlugin = {
        purchase: vi.fn().mockResolvedValue({ success: true, orderId: 'test_order' }),
        queryProductDetails: vi.fn().mockResolvedValue({ products: [] }),
        restorePurchases: vi.fn().mockResolvedValue({ purchases: [] }),
        presentCodeRedemptionSheet: vi.fn().mockResolvedValue({ success: true }),
      };

      (globalThis as any).Capacitor = {
        Plugins: {
          AppleStoreKit: mockPlugin,
        },
      };
      (globalThis as any).window.Capacitor = (globalThis as any).Capacitor;

      const plugin = getStoreKit();
      expect(plugin).toBe(mockPlugin);
    });

    it('throws error when purchaseAppleSubscription is called on non-iOS or web platform', async () => {
      // In vitest default node/jsdom environment without Capacitor native flag
      await expect(purchaseAppleSubscription('weekly')).rejects.toThrow(
        /Apple In-App Purchase is only available on native iOS devices/
      );
    });

    it('returns empty array gracefully on non-iOS platform for queryAppleProducts', async () => {
      const products = await queryAppleProducts();
      expect(Array.isArray(products)).toBe(true);
      expect(products).toHaveLength(0);
    });

    it('returns empty array gracefully on non-iOS platform for restoreApplePurchases', async () => {
      const purchases = await restoreApplePurchases();
      expect(Array.isArray(purchases)).toBe(true);
      expect(purchases).toHaveLength(0);
    });

    it('resolves without error for presentAppleCodeRedemptionSheet on web/test platform', async () => {
      await expect(presentAppleCodeRedemptionSheet()).resolves.toBeUndefined();
    });
  });

  describe('AudioContext Non-Blocking Resume (safeResumeAudioContext)', () => {
    it('returns false immediately when AudioContext is null', async () => {
      const res = await safeResumeAudioContext(null);
      expect(res).toBe(false);
    });

    it('returns true immediately when AudioContext is already running', async () => {
      const mockCtx = {
        state: 'running',
        resume: vi.fn(),
      } as unknown as AudioContext;

      const res = await safeResumeAudioContext(mockCtx);
      expect(res).toBe(true);
      expect(mockCtx.resume).not.toHaveBeenCalled();
    });

    it('attempts resume without hanging when AudioContext is suspended', async () => {
      const mockCtx = {
        state: 'suspended',
        resume: vi.fn().mockImplementation(async () => {
          (mockCtx as any).state = 'running';
        }),
      } as unknown as AudioContext;

      const res = await safeResumeAudioContext(mockCtx);
      expect(res).toBe(true);
      expect(mockCtx.resume).toHaveBeenCalled();
    });

    it('times out safely in 300ms if AudioContext resume promise hangs on iOS WebKit', async () => {
      const mockCtx = {
        state: 'suspended',
        // Simulate WebKit suspended promise that never resolves without user tap
        resume: vi.fn().mockImplementation(() => new Promise(() => {})),
      } as unknown as AudioContext;

      const startTime = Date.now();
      const res = await safeResumeAudioContext(mockCtx);
      const elapsed = Date.now() - startTime;

      expect(res).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(250);
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
