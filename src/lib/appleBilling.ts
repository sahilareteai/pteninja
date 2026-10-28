import { registerPlugin } from '@capacitor/core';
import { isNativeMobile, isIOS } from './mobile';

export interface AppleProduct {
  productId: string;
  title: string;
  description: string;
  formattedPrice?: string;
  price?: number;
  billingPeriodUnit?: string;
  billingPeriodValue?: number;
  introductoryPrice?: string;
  hasIntroductoryOffer?: boolean;
}

export interface ApplePurchaseResult {
  success?: boolean;
  canceled?: boolean;
  pending?: boolean;
  orderId?: string;
  originalTransactionId?: string;
  purchaseToken?: string;
  productId?: string;
  purchaseTime?: number;
  expirationTime?: number;
}

export interface AppleStoreKitPluginInterface {
  purchase(options: { productId: string }): Promise<ApplePurchaseResult>;
  queryProductDetails(options: { productIds: string[] }): Promise<{ products: AppleProduct[] }>;
  restorePurchases(): Promise<{ purchases: ApplePurchaseResult[] }>;
  presentCodeRedemptionSheet(): Promise<{ success?: boolean }>;
}

const NativeAppleStoreKit = registerPlugin<AppleStoreKitPluginInterface>('AppleStoreKit');

/**
 * Accesses the StoreKit 2 native plugin instance, checking direct Capacitor.Plugins export first.
 */
export function getStoreKit(): AppleStoreKitPluginInterface {
  if (typeof window !== 'undefined' && (window as any).Capacitor?.Plugins?.AppleStoreKit) {
    return (window as any).Capacitor.Plugins.AppleStoreKit;
  }
  return NativeAppleStoreKit;
}

/**
 * Mapping between internal plan ID and Apple App Store subscription product IDs.
 * These match the Auto-Renewable Subscriptions configured in App Store Connect.
 */
export const APPLE_SUBSCRIPTION_MAP: Record<string, { productId: string }> = {
  weekly: {
    productId: 'pte_ninja_weekly',
  },
  monthly: {
    productId: 'pte_ninja_monthly',
  },
  quarterly: {
    productId: 'pte_ninja_quarterly',
  },
  annual: {
    productId: 'pte_ninja_annual',
  },
};

/**
 * Initiates native Apple In-App Purchase (StoreKit 2) for the specified plan ID.
 */
export async function purchaseAppleSubscription(planId: string): Promise<ApplePurchaseResult> {
  if (!isNativeMobile() || !isIOS()) {
    throw new Error('Apple In-App Purchase is only available on native iOS devices.');
  }

  const normalizedPlanId = planId.toLowerCase().trim();
  const config = APPLE_SUBSCRIPTION_MAP[normalizedPlanId];
  if (!config) {
    throw new Error(`No Apple App Store product mapped for plan: ${planId}`);
  }

  return await getStoreKit().purchase({
    productId: config.productId,
  });
}

/**
 * Queries localized product pricing from Apple App Store via StoreKit 2.
 */
export async function queryAppleProducts(): Promise<AppleProduct[]> {
  if (!isNativeMobile() || !isIOS()) {
    return [];
  }

  try {
    const productIds = Object.values(APPLE_SUBSCRIPTION_MAP).map(item => item.productId);
    const result = await getStoreKit().queryProductDetails({ productIds });
    return result.products || [];
  } catch (err) {
    console.warn('Failed to query Apple App Store products:', err);
    return [];
  }
}

/**
 * Restores past Apple App Store purchases for the active Apple ID.
 */
export async function restoreApplePurchases(): Promise<ApplePurchaseResult[]> {
  if (!isNativeMobile() || !isIOS()) {
    return [];
  }

  try {
    const res = await getStoreKit().restorePurchases();
    return res.purchases || [];
  } catch (err) {
    console.warn('Failed to restore Apple purchases:', err);
    return [];
  }
}

/**
 * Opens Apple's native Offer Code redemption sheet (iOS 14+).
 * Allows users to redeem custom promotional codes or one-time offer codes from App Store Connect.
 */
export async function presentAppleCodeRedemptionSheet(): Promise<void> {
  if (!isNativeMobile() || !isIOS()) {
    return;
  }

  try {
    await getStoreKit().presentCodeRedemptionSheet();
  } catch (err) {
    console.warn('Failed to present Apple code redemption sheet:', err);
  }
}
