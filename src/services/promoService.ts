import { SUBSCRIPTION_PLANS } from '../types';
import { db, collection, getDocs, query, where, doc, getDoc } from '../firebase';

export interface PromoCode {
  code: string;
  discountPercent: number;
  description: string;
  isActive: boolean;
}

export class PromoService {
  private static promoCodes: Record<string, PromoCode> = {};
  private static isInitialized = false;

  static async initialize() {
    if (this.isInitialized) return;
    
    try {
      const querySnapshot = await getDocs(collection(db, 'promoCodes'));
      querySnapshot.forEach((doc) => {
        const data = doc.data() as PromoCode;
        this.promoCodes[data.code.toUpperCase()] = data;
      });
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize promo codes from Firestore:', error);
      // Fallback to hardcoded codes if Firestore fails
      this.promoCodes = {
        'NINJA-PTE-SPECIAL-10': { code: 'NINJA-PTE-SPECIAL-10', discountPercent: 10, description: 'Additional 10% off special discount', isActive: true },
        'NINJA-PTE-SPECIAL-25': { code: 'NINJA-PTE-SPECIAL-25', discountPercent: 25, description: 'Additional 25% off special discount', isActive: true },
        'NINJA-PTE-SPECIAL-50': { code: 'NINJA-PTE-SPECIAL-50', discountPercent: 50, description: 'Additional 50% off special discount', isActive: true },
        'WELCOME': { code: 'WELCOME', discountPercent: 15, description: 'Welcome Bonus 15% Off', isActive: true },
      };
    }
  }

  static async validate(code: string): Promise<PromoCode | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const normalizedCode = code.trim().toUpperCase();
    const promo = this.promoCodes[normalizedCode];
    if (promo && promo.isActive) {
      return promo;
    }
    return null;
  }

  static calculateDiscount(amount: number, discountPercent: number): number {
    const discount = (amount * discountPercent) / 100;
    return Math.round(amount - discount);
  }
}
