import { registerPlugin } from '@capacitor/core';
import { isNativeMobile } from './mobile';

export interface PlayBillingProduct {
  productId: string;
  title: string;
  description: string;
  basePlanId?: string;
  offerToken?: string;
  formattedPrice?: string;
  priceAmountMicros?: number;
  priceCurrencyCode?: string;
  billingPeriod?: string;
}

export interface PurchaseResult {
  success?: boolean;
  canceled?: boolean;
  pending?: boolean;
  orderId?: string;
  purchaseToken?: string;
  purchaseTime?: number;
  products?: string[];
  isAcknowledged?: boolean;
}

export interface PlayBillingPluginInterface {
  purchase(options: { productId: string; basePlanId?: string }): Promise<PurchaseResult>;
  queryProductDetails(options: { productIds: string[] }): Promise<{ products: PlayBillingProduct[] }>;
  restorePurchases(): Promise<{ purchases: PurchaseResult[] }>;
}

const NativePlayBilling = registerPlugin<PlayBillingPluginInterface>('PlayBilling');

/**
 * Mapping between internal plan ID and Google Play Console subscription product ID
 */
export const PLAY_SUBSCRIPTION_MAP: Record<string, { productId: string; basePlanId: string }> = {
  weekly: {
    productId: 'pte_ninja_weekly',
    basePlanId: 'weekly-auto',
  },
  monthly: {
    productId: 'pte_ninja_monthly',
    basePlanId: 'monthly-auto',
  },
  quarterly: {
    productId: 'pte_ninja_quarterly',
    basePlanId: 'quarterly-auto',
  },
  annual: {
    productId: 'pte_ninja_annual',
    basePlanId: 'annual-auto',
  },
};

/**
 * Initiates Google Play in-app purchase for the specified plan ID.
 */
export async function purchasePlaySubscription(planId: string): Promise<PurchaseResult> {
  if (!isNativeMobile()) {
    throw new Error('Google Play In-App Billing is only available on native Android devices.');
  }

  const normalizedPlanId = planId.toLowerCase().trim();
  const config = PLAY_SUBSCRIPTION_MAP[normalizedPlanId];
  if (!config) {
    throw new Error(`No Google Play product mapped for plan: ${planId}`);
  }

  return await NativePlayBilling.purchase({
    productId: config.productId,
    basePlanId: config.basePlanId,
  });
}

/**
 * Queries localized product pricing from Google Play.
 */
export async function queryPlayProducts(): Promise<PlayBillingProduct[]> {
  if (!isNativeMobile()) {
    return [];
  }

  try {
    const productIds = Object.values(PLAY_SUBSCRIPTION_MAP).map(item => item.productId);
    const result = await NativePlayBilling.queryProductDetails({ productIds });
    return result.products || [];
  } catch (err) {
    console.warn('Failed to query Google Play products:', err);
    return [];
  }
}

/**
 * Restores existing purchases for the active Google account.
 */
export async function restorePlayPurchases(): Promise<PurchaseResult[]> {
  if (!isNativeMobile()) {
    return [];
  }

  try {
    const res = await NativePlayBilling.restorePurchases();
    return res.purchases || [];
  } catch (err) {
    console.warn('Failed to restore purchases:', err);
    return [];
  }
}
