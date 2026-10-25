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
}

const NativeAppleStoreKit = registerPlugin<AppleStoreKitPluginInterface>('AppleStoreKit');

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

  return await NativeAppleStoreKit.purchase({
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
    const result = await NativeAppleStoreKit.queryProductDetails({ productIds });
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
    const res = await NativeAppleStoreKit.restorePurchases();
    return res.purchases || [];
  } catch (err) {
    console.warn('Failed to restore Apple purchases:', err);
    return [];
  }
}
