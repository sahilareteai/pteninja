import { registerPlugin } from '@capacitor/core';
import { isNativeMobile, isAndroid } from './mobile';

export interface PlayBillingOffer {
  basePlanId?: string;
  offerId?: string;
  offerToken: string;
  tags?: string[];
  formattedPrice?: string;
  priceAmountMicros?: number;
  billingPeriod?: string;
}

export interface PlayBillingProduct {
  productId: string;
  title: string;
  description: string;
  basePlanId?: string;
  offerId?: string;
  offerToken?: string;
  formattedPrice?: string;
  priceAmountMicros?: number;
  priceCurrencyCode?: string;
  billingPeriod?: string;
  recurringFormattedPrice?: string;
  hasOffer?: boolean;
  offers?: PlayBillingOffer[];
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

export interface PlayBillingPurchaseOptions {
  productId: string;
  basePlanId?: string;
  offerId?: string;
  promoCode?: string;
  hasPromo?: boolean;
}

export interface PlayBillingPluginInterface {
  purchase(options: PlayBillingPurchaseOptions): Promise<PurchaseResult>;
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

export type PurchaseSubscriptionOptions = 
  | string 
  | { offerId?: string; promoCode?: string; hasPromo?: boolean };

/**
 * Initiates Google Play checkout for the specified plan ID, optionally targeting a promo or specific offer.
 */
export async function purchasePlaySubscription(
  planId: string, 
  options?: PurchaseSubscriptionOptions
): Promise<PurchaseResult> {
  if (!isNativeMobile() || !isAndroid()) {
    throw new Error('Google Play purchases are only available on Android devices.');
  }

  const normalizedPlanId = planId.toLowerCase().trim();
  const config = PLAY_SUBSCRIPTION_MAP[normalizedPlanId];
  if (!config) {
    throw new Error(`No Google Play product mapped for plan: ${planId}`);
  }

  const offerId = typeof options === 'string' ? options : options?.offerId;
  const promoCode = typeof options === 'object' ? options?.promoCode : undefined;
  const hasPromo = typeof options === 'object' ? options?.hasPromo : Boolean(offerId);

  return await NativePlayBilling.purchase({
    productId: config.productId,
    basePlanId: config.basePlanId,
    offerId: offerId,
    promoCode: promoCode,
    hasPromo: hasPromo,
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
