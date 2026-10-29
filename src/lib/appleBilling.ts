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

export interface ApplePlanConfig {
  productId: string;
  candidateIds: string[];
}

/**
 * Mapping between internal plan ID and Apple App Store subscription product IDs.
 * Includes all standard bundle-prefixed and suffix variations for bulletproof matching.
 */
export const APPLE_SUBSCRIPTION_MAP: Record<string, ApplePlanConfig> = {
  weekly: {
    productId: 'pte_ninja_weekly',
    candidateIds: [
      'pte_ninja_weekly',
      'com.pteninja.app.weekly',
      'com.pteninja.app.pte_ninja_weekly',
      'com.pteninja.app.pteninja_weekly',
      'com.pteninja.app.sub.weekly',
      'com.pteninja.app.subscription.weekly',
      'com.pteninja.app.vip.weekly',
      'com.pteninja.weekly',
      'pteninja_weekly',
      'pteninja.weekly',
      'pte_weekly',
      'weekly_vip',
      'vip_weekly',
      'weekly',
      'sub_weekly',
      'subscription_weekly',
    ],
  },
  monthly: {
    productId: 'pte_ninja_monthly',
    candidateIds: [
      'pte_ninja_monthly',
      'com.pteninja.app.monthly',
      'com.pteninja.app.pte_ninja_monthly',
      'com.pteninja.app.pteninja_monthly',
      'com.pteninja.app.sub.monthly',
      'com.pteninja.app.subscription.monthly',
      'com.pteninja.app.vip.monthly',
      'com.pteninja.monthly',
      'pteninja_monthly',
      'pteninja.monthly',
      'pte_monthly',
      'monthly_vip',
      'vip_monthly',
      'monthly',
      'sub_monthly',
      'subscription_monthly',
    ],
  },
  quarterly: {
    productId: 'pte_ninja_quarterly',
    candidateIds: [
      'pte_ninja_quarterly',
      'com.pteninja.app.quarterly',
      'com.pteninja.app.pte_ninja_quarterly',
      'com.pteninja.app.pteninja_quarterly',
      'com.pteninja.app.sub.quarterly',
      'com.pteninja.app.subscription.quarterly',
      'com.pteninja.app.vip.quarterly',
      'com.pteninja.quarterly',
      'pteninja_quarterly',
      'pteninja.quarterly',
      'pte_quarterly',
      'quarterly_vip',
      'vip_quarterly',
      'quarterly',
      'sub_quarterly',
      'subscription_quarterly',
      '3months',
      '3_months',
    ],
  },
  annual: {
    productId: 'pte_ninja_annual',
    candidateIds: [
      'pte_ninja_annual',
      'com.pteninja.app.annual',
      'com.pteninja.app.pte_ninja_annual',
      'com.pteninja.app.pteninja_annual',
      'com.pteninja.app.sub.annual',
      'com.pteninja.app.subscription.annual',
      'com.pteninja.app.vip.annual',
      'com.pteninja.annual',
      'pteninja_annual',
      'pteninja.annual',
      'pte_annual',
      'pte_yearly',
      'annual_vip',
      'yearly_vip',
      'vip_annual',
      'vip_yearly',
      'annual',
      'yearly',
      'sub_annual',
      'subscription_annual',
      '1year',
      '1_year',
    ],
  },
};

/**
 * Initiates native Apple In-App Purchase (StoreKit 2) for the specified plan ID.
 * If a verified product ID was resolved from Apple StoreKit during query, it is used directly.
 */
export async function purchaseAppleSubscription(
  planId: string,
  verifiedProductId?: string
): Promise<ApplePurchaseResult> {
  if (!isNativeMobile() || !isIOS()) {
    throw new Error('Apple In-App Purchase is only available on native iOS devices.');
  }

  const normalizedPlanId = planId.toLowerCase().trim();
  const config = APPLE_SUBSCRIPTION_MAP[normalizedPlanId];
  if (!config && !verifiedProductId) {
    throw new Error(`No Apple App Store product mapped for plan: ${planId}`);
  }

  const targetProductId = verifiedProductId || config?.productId || planId;
  const candidateIds = config?.candidateIds || [targetProductId];

  return await getStoreKit().purchase({
    productId: targetProductId,
    candidateIds,
  } as any);
}

/**
 * Queries localized product pricing from Apple App Store via StoreKit 2.
 * Queries all plausible candidate product IDs across all configured tiers.
 */
export async function queryAppleProducts(): Promise<AppleProduct[]> {
  if (!isNativeMobile() || !isIOS()) {
    return [];
  }

  try {
    const productIds: string[] = [];
    Object.values(APPLE_SUBSCRIPTION_MAP).forEach(item => {
      productIds.push(...item.candidateIds);
    });
    const uniqueIds = Array.from(new Set(productIds));
    const result = await getStoreKit().queryProductDetails({ productIds: uniqueIds });
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
