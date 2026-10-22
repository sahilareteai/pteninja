import { SUBSCRIPTION_PLANS } from '../types';
import { db, collection, getDocs, query, where, doc, getDoc, updateDoc, addDoc } from '../firebase';

export interface PromoCode {
  code: string;
  discountPercent: number;
  description: string;
  isActive: boolean;
  isReferral?: boolean;
  referrerUid?: string;
  referrerName?: string;
}

export function generateUserReferralCode(displayName?: string | null, uid?: string): string {
  let cleanName = (displayName || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 5);

  if (!cleanName || cleanName.length < 3) {
    cleanName = 'NINJA';
  }

  // 4 random alphanumeric chars (excluding easily confused 0, O, 1, I)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `${cleanName}-${suffix}`;
}

export class PromoService {
  private static promoCodes: Record<string, PromoCode> = {};
  private static isInitialized = false;

  static async initialize() {
    if (this.isInitialized) return;
    
    try {
      const querySnapshot = await getDocs(collection(db, 'promoCodes'));
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data() as PromoCode;
        this.promoCodes[data.code.toUpperCase()] = data;
      });
      if (!this.promoCodes['NINJA10']) {
        this.promoCodes['NINJA10'] = { code: 'NINJA10', discountPercent: 10, description: 'Secret Ninja 10% Discount', isActive: true };
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize promo codes from Firestore:', error);
      // Fallback to hardcoded codes if Firestore fails
      this.promoCodes = {
        'NINJA10': { code: 'NINJA10', discountPercent: 10, description: 'Secret Ninja 10% Discount', isActive: true },
        'NINJA-PTE-SPECIAL-10': { code: 'NINJA-PTE-SPECIAL-10', discountPercent: 10, description: 'Additional 10% off special discount', isActive: true },
        'NINJA-PTE-SPECIAL-25': { code: 'NINJA-PTE-SPECIAL-25', discountPercent: 25, description: 'Additional 25% off special discount', isActive: true },
        'NINJA-PTE-SPECIAL-50': { code: 'NINJA-PTE-SPECIAL-50', discountPercent: 50, description: 'Additional 50% off special discount', isActive: true },
        'WELCOME': { code: 'WELCOME', discountPercent: 15, description: 'Welcome Bonus 15% Off', isActive: true },
      };
    }
  }

  /**
   * Validates a code with detailed error message support.
   * Checks system promo codes first, then queries user referral codes from Firestore.
   * Enforces self-referral prevention and single-code usage.
   */
  static async validateDetailed(
    code: string,
    currentUserId?: string
  ): Promise<{ promo: PromoCode | null; error?: string }> {
    if (!code || !code.trim()) {
      return { promo: null, error: 'Please enter a referral or promo code.' };
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    const normalizedCode = code.trim().toUpperCase();

    // 1. Check system promo codes
    const systemPromo = this.promoCodes[normalizedCode];
    if (systemPromo && systemPromo.isActive) {
      return { promo: systemPromo };
    }

    // 2. Query user referral codes in Firestore
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('referralCode', '==', normalizedCode));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const referrerDoc = snap.docs[0];
        const referrerData = referrerDoc.data();

        // Prevent self-referral
        if (currentUserId && referrerDoc.id === currentUserId) {
          return { promo: null, error: 'You cannot use your own referral code.' };
        }

        const referralPromo: PromoCode = {
          code: normalizedCode,
          discountPercent: 10,
          description: `Referral 10% discount from ${referrerData.displayName || 'a fellow Ninja'}!`,
          isActive: true,
          isReferral: true,
          referrerUid: referrerDoc.id,
          referrerName: referrerData.displayName || 'Friend',
        };

        return { promo: referralPromo };
      }
    } catch (err) {
      console.warn('Error querying referral code:', err);
    }

    return { promo: null, error: 'Invalid referral or promo code. Please check and try again.' };
  }

  /** Backward-compatible validate method returning PromoCode | null */
  static async validate(code: string, currentUserId?: string): Promise<PromoCode | null> {
    const result = await this.validateDetailed(code, currentUserId);
    return result.promo;
  }

  static calculateDiscount(amount: number, discountPercent: number): number {
    const discount = (amount * discountPercent) / 100;
    return Math.round(amount - discount);
  }

  /**
   * Increments the referrer's referral count and logs the referral event in Firestore.
   */
  static async recordReferralUse(
    referrerUid: string,
    buyerUid: string,
    planId: string,
    code: string
  ): Promise<void> {
    try {
      if (!referrerUid) return;
      const referrerRef = doc(db, 'users', referrerUid);
      const referrerSnap = await getDoc(referrerRef);
      if (referrerSnap.exists()) {
        const currentCount = (referrerSnap.data().referralCount || 0) + 1;
        await updateDoc(referrerRef, {
          referralCount: currentCount,
        });
      }

      // Log the referral event
      await addDoc(collection(db, 'referralLogs'), {
        referrerUid,
        buyerUid,
        planId,
        referralCode: code,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    } catch (e) {
      console.warn('Failed to record referral use:', e);
    }
  }
}

