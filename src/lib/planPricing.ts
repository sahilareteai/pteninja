/**
 * Helper to calculate and format subscription plan pricing with crystal-clear
 * cadence, rounded rates (no unrounded decimals), and secondary breakdown in brackets.
 */

export interface PlanPricingInput {
  planId: string;
  interval: string;
  basePrice: number;
  originalPrice?: number;
  nativePrice?: number;
  formattedNativePrice?: string;
  currencySymbol?: string;
  discountPercent?: number;
}

export interface PlanPricingResult {
  symbol: string;
  baseNumPrice: number;
  originalNumPrice: number;
  effectiveNumPrice: number;
  strikeThroughNum: number;
  hasPromoDiscount: boolean;
  discountPercent: number;
  primaryDisplay: string;
  cadenceSubtext: string;
  bracketBreakdown: string;
  monthlyEquivalent: number;
  weeklyEquivalent: number;
}

/**
 * Calculates rounded prices and clear layman billing breakdown for any plan.
 */
export function calculatePlanPricing(input: PlanPricingInput): PlanPricingResult {
  const {
    planId,
    interval,
    basePrice,
    originalPrice,
    nativePrice,
    formattedNativePrice,
    currencySymbol,
    discountPercent: rawDiscountPercent = 0,
  } = input;

  // 1. Resolve currency symbol
  let symbol = currencySymbol || '$';
  if (formattedNativePrice) {
    const extracted = formattedNativePrice.replace(/[0-9.,\s]/g, '');
    if (extracted) symbol = extracted;
  }

  // 2. Base numeric price (strictly rounded)
  let baseNumPrice: number;
  if (nativePrice && nativePrice > 0) {
    baseNumPrice = Math.round(nativePrice);
  } else {
    baseNumPrice = Math.round(basePrice || 0);
  }

  // 3. Original comparison price for strikethrough (strictly rounded)
  let originalNumPrice: number;
  if (nativePrice && nativePrice > 0 && basePrice > 0 && originalPrice) {
    originalNumPrice = Math.round(nativePrice * (originalPrice / basePrice));
  } else if (originalPrice && originalPrice > 0) {
    originalNumPrice = Math.round(originalPrice);
  } else {
    originalNumPrice = Math.round(baseNumPrice * 1.5);
  }

  // 4. Promo discount calculation
  const hasPromoDiscount = Boolean(rawDiscountPercent && rawDiscountPercent > 0);
  const discountPercent = hasPromoDiscount ? rawDiscountPercent : 0;

  const effectiveNumPrice = hasPromoDiscount
    ? Math.round(baseNumPrice * (1 - discountPercent / 100))
    : baseNumPrice;

  // Strikethrough logic:
  // If promo is applied, strike through the standard base price (e.g. ₹750)
  // If no promo, strike through the higher original anchor price (e.g. ₹1,000)
  const strikeThroughNum = hasPromoDiscount ? baseNumPrice : originalNumPrice;

  // 5. Cadence & bracket breakdown calculations
  let cadenceSubtext = `/${interval}`;
  let bracketBreakdown = '';
  let monthlyEquivalent = 0;
  let weeklyEquivalent = 0;

  const normalizedId = (planId || '').toLowerCase().trim();

  if (normalizedId === 'weekly') {
    // 7 days
    weeklyEquivalent = effectiveNumPrice;
    monthlyEquivalent = Math.round((effectiveNumPrice * 52) / 12);
    cadenceSubtext = '/ week';
    bracketBreakdown = `(approx ${symbol}${monthlyEquivalent.toLocaleString()} / month • Billed weekly)`;
  } else if (normalizedId === 'monthly') {
    // 30 days
    monthlyEquivalent = effectiveNumPrice;
    weeklyEquivalent = Math.round((effectiveNumPrice * 12) / 52);
    cadenceSubtext = '/ month';
    bracketBreakdown = `(approx ${symbol}${weeklyEquivalent.toLocaleString()} / week • Billed monthly)`;
  } else if (normalizedId === 'quarterly') {
    // 3 months / 90 days
    monthlyEquivalent = Math.round(effectiveNumPrice / 3);
    weeklyEquivalent = Math.round(effectiveNumPrice / 13);
    cadenceSubtext = 'for 3 months';
    bracketBreakdown = `(${symbol}${monthlyEquivalent.toLocaleString()} / month • approx ${symbol}${weeklyEquivalent.toLocaleString()} / week • Billed every 3 months)`;
  } else if (normalizedId === 'annual') {
    // 12 months / 365 days
    monthlyEquivalent = Math.round(effectiveNumPrice / 12);
    weeklyEquivalent = Math.round(effectiveNumPrice / 52);
    cadenceSubtext = '/ year';
    bracketBreakdown = `(${symbol}${monthlyEquivalent.toLocaleString()} / month • approx ${symbol}${weeklyEquivalent.toLocaleString()} / week • Billed annually)`;
  } else {
    cadenceSubtext = `/${interval}`;
    bracketBreakdown = `(${symbol}${effectiveNumPrice.toLocaleString()} per ${interval})`;
  }

  const primaryDisplay = `${symbol}${effectiveNumPrice.toLocaleString()}`;

  return {
    symbol,
    baseNumPrice,
    originalNumPrice,
    effectiveNumPrice,
    strikeThroughNum,
    hasPromoDiscount,
    discountPercent,
    primaryDisplay,
    cadenceSubtext,
    bracketBreakdown,
    monthlyEquivalent,
    weeklyEquivalent,
  };
}
