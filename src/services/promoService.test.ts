import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateUserReferralCode, PromoService } from './promoService';

// Mock Firebase client SDK
const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockAddDoc = vi.fn();

vi.mock('../firebase', () => ({
  db: {},
  collection: vi.fn((_db, name) => ({ name })),
  query: vi.fn((coll, ...clauses) => ({ coll, clauses })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  doc: vi.fn((_db, collName, id) => ({ collName, id })),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  addDoc: (...args: any[]) => mockAddDoc(...args),
}));

describe('generateUserReferralCode', () => {
  it('generates a formatted code with clean name prefix and 4-char suffix', () => {
    const code = generateUserReferralCode('Sahil Sharma', 'user_123');
    expect(code).toMatch(/^SAHIL-[2-9A-HJ-NP-Z]{4}$/);
  });

  it('falls back to NINJA prefix when name is missing or too short', () => {
    const code1 = generateUserReferralCode(null, 'user_123');
    expect(code1).toMatch(/^NINJA-[2-9A-HJ-NP-Z]{4}$/);

    const code2 = generateUserReferralCode('Al', 'user_123');
    expect(code2).toMatch(/^NINJA-[2-9A-HJ-NP-Z]{4}$/);
  });

  it('strips special characters and spaces from the name', () => {
    const code = generateUserReferralCode('Dr. John-Doe #1', 'user_123');
    expect(code).toMatch(/^DRJOH-[2-9A-HJ-NP-Z]{4}$/);
  });
});

describe('PromoService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateDiscount', () => {
    it('calculates 10% discount properly', () => {
      expect(PromoService.calculateDiscount(100, 10)).toBe(90);
      expect(PromoService.calculateDiscount(50, 10)).toBe(45);
    });

    it('calculates 50% discount properly', () => {
      expect(PromoService.calculateDiscount(100, 50)).toBe(50);
    });
  });

  describe('validateDetailed', () => {
    it('returns error for empty or blank code', async () => {
      const res1 = await PromoService.validateDetailed('');
      expect(res1.promo).toBeNull();
      expect(res1.error).toContain('Please enter');

      const res2 = await PromoService.validateDetailed('   ');
      expect(res2.promo).toBeNull();
    });

    it('validates a system promo code successfully', async () => {
      mockGetDocs.mockResolvedValueOnce({
        forEach: (cb: any) => {
          cb({
            data: () => ({
              code: 'SAVE20',
              discountPercent: 20,
              description: 'Save 20%',
              isActive: true,
            }),
          });
        },
      });

      const res = await PromoService.validateDetailed('SAVE20');
      expect(res.promo).not.toBeNull();
      expect(res.promo?.discountPercent).toBe(20);
    });

    it('validates secret ninja code NINJA10 giving 10% discount', async () => {
      const res = await PromoService.validateDetailed('NINJA10');
      expect(res.promo).not.toBeNull();
      expect(res.promo?.discountPercent).toBe(10);
      expect(res.promo?.code).toBe('NINJA10');
    });

    it('validates Diwali festive voucher DIWALI20 giving 20% discount', async () => {
      const res = await PromoService.validateDetailed('DIWALI20');
      expect(res.promo).not.toBeNull();
      expect(res.promo?.discountPercent).toBe(20);
      expect(res.promo?.code).toBe('DIWALI20');
    });

    it('validates DIWALI20 case-insensitively (diwali20)', async () => {
      const res = await PromoService.validateDetailed('diwali20');
      expect(res.promo).not.toBeNull();
      expect(res.promo?.discountPercent).toBe(20);
      expect(res.promo?.code).toBe('DIWALI20');
    });

    it('validates a valid friend referral code with 10% discount', async () => {
      // Mock Firestore query returning a referrer user doc
      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'referrer_user_id',
            data: () => ({
              displayName: 'Alice Ninja',
              referralCode: 'ALICE-9X2K',
            }),
          },
        ],
      });

      const res = await PromoService.validateDetailed('ALICE-9X2K', 'different_buyer_uid');
      expect(res.promo).not.toBeNull();
      expect(res.promo?.isReferral).toBe(true);
      expect(res.promo?.discountPercent).toBe(10);
      expect(res.promo?.referrerUid).toBe('referrer_user_id');
      expect(res.promo?.referrerName).toBe('Alice Ninja');
    });

    it('rejects self-referral when buyer uses their own referral code', async () => {
      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'my_own_uid',
            data: () => ({
              displayName: 'Myself',
              referralCode: 'MYSELF-7777',
            }),
          },
        ],
      });

      const res = await PromoService.validateDetailed('MYSELF-7777', 'my_own_uid');
      expect(res.promo).toBeNull();
      expect(res.error).toBe('You cannot use your own referral code.');
    });

    it('returns error if code is not found in system or referral users', async () => {
      mockGetDocs.mockResolvedValueOnce({
        empty: true,
        docs: [],
      });

      const res = await PromoService.validateDetailed('NONEXISTENT-CODE', 'user_123');
      expect(res.promo).toBeNull();
      expect(res.error).toContain('Invalid referral or promo code');
    });
  });

  describe('recordReferralUse', () => {
    it('increments referrer referralCount and logs referral event', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ referralCount: 2 }),
      });
      mockUpdateDoc.mockResolvedValueOnce(undefined);
      mockAddDoc.mockResolvedValueOnce({ id: 'log_123' });

      await PromoService.recordReferralUse('referrer_123', 'buyer_456', 'monthly', 'ALICE-9X2K');

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'referrer_123' }),
        { referralCount: 3 }
      );
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'referralLogs' }),
        expect.objectContaining({
          referrerUid: 'referrer_123',
          buyerUid: 'buyer_456',
          planId: 'monthly',
          referralCode: 'ALICE-9X2K',
        })
      );
    });
  });
});
