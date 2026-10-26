import { describe, it, expect } from 'vitest';
import { calculatePlanPricing } from './planPricing';

describe('calculatePlanPricing', () => {
  it('formats Weekly plan correctly with regular price', () => {
    const res = calculatePlanPricing({
      planId: 'weekly',
      interval: 'week',
      basePrice: 11,
      originalPrice: 15,
      nativePrice: 750,
      formattedNativePrice: '₹750.00',
      currencySymbol: '₹',
    });

    expect(res.symbol).toBe('₹');
    expect(res.baseNumPrice).toBe(750);
    expect(res.effectiveNumPrice).toBe(750);
    expect(res.primaryDisplay).toBe('₹750');
    expect(res.cadenceSubtext).toBe('/ week');
    // 750 * 52 / 12 = 3250
    expect(res.bracketBreakdown).toBe('(approx ₹3,250 / month • Billed weekly)');
    expect(res.hasPromoDiscount).toBe(false);
  });

  it('applies Diwali 20% discount to Weekly plan (₹750 -> ₹600)', () => {
    const res = calculatePlanPricing({
      planId: 'weekly',
      interval: 'week',
      basePrice: 11,
      originalPrice: 15,
      nativePrice: 750,
      formattedNativePrice: '₹750.00',
      currencySymbol: '₹',
      discountPercent: 20,
    });

    expect(res.symbol).toBe('₹');
    expect(res.baseNumPrice).toBe(750);
    expect(res.effectiveNumPrice).toBe(600);
    expect(res.strikeThroughNum).toBe(750);
    expect(res.primaryDisplay).toBe('₹600');
    expect(res.cadenceSubtext).toBe('/ week');
    // 600 * 52 / 12 = 2600
    expect(res.bracketBreakdown).toBe('(approx ₹2,600 / month • Billed weekly)');
    expect(res.hasPromoDiscount).toBe(true);
    expect(res.discountPercent).toBe(20);
  });

  it('rounds raw floats like 2657.14 cleanly and formats Quarterly breakdown', () => {
    const res = calculatePlanPricing({
      planId: 'quarterly',
      interval: '3 months',
      basePrice: 50,
      originalPrice: 90,
      nativePrice: 2657.14,
      formattedNativePrice: '₹2,657.14',
      currencySymbol: '₹',
    });

    expect(res.symbol).toBe('₹');
    expect(res.baseNumPrice).toBe(2657);
    expect(res.effectiveNumPrice).toBe(2657);
    expect(res.primaryDisplay).toBe('₹2,657');
    expect(res.cadenceSubtext).toBe('for 3 months');
    // Monthly = 2657 / 3 = 886, Weekly = 2657 / 13 = 204
    expect(res.bracketBreakdown).toBe('(₹886 / month • approx ₹204 / week • Billed every 3 months)');
  });

  it('applies Diwali 20% discount to Quarterly plan with unrounded native price', () => {
    const res = calculatePlanPricing({
      planId: 'quarterly',
      interval: '3 months',
      basePrice: 50,
      originalPrice: 90,
      nativePrice: 2657.14,
      formattedNativePrice: '₹2,657.14',
      currencySymbol: '₹',
      discountPercent: 20,
    });

    // 2657 * 0.8 = 2125.6 -> 2126
    expect(res.effectiveNumPrice).toBe(2126);
    expect(res.strikeThroughNum).toBe(2657);
    expect(res.primaryDisplay).toBe('₹2,126');
    expect(res.cadenceSubtext).toBe('for 3 months');
    // 2126 / 3 = 709, 2126 / 13 = 164
    expect(res.bracketBreakdown).toBe('(₹709 / month • approx ₹164 / week • Billed every 3 months)');
  });

  it('formats Monthly plan correctly with Google Play Store base price (₹1400 -> ₹1120 with 20% discount)', () => {
    const res = calculatePlanPricing({
      planId: 'monthly',
      interval: 'month',
      basePrice: 1400,
      originalPrice: 2000,
      nativePrice: 1400,
      formattedNativePrice: '₹1,400.00',
      currencySymbol: '₹',
      discountPercent: 20,
    });

    expect(res.symbol).toBe('₹');
    expect(res.baseNumPrice).toBe(1400);
    expect(res.effectiveNumPrice).toBe(1120);
    expect(res.strikeThroughNum).toBe(1400);
    expect(res.primaryDisplay).toBe('₹1,120');
    expect(res.cadenceSubtext).toBe('/ month');
    // 1120 * 12 / 52 = 258
    expect(res.bracketBreakdown).toBe('(approx ₹258 / week • Billed monthly)');
  });

  it('formats Quarterly plan correctly with Google Play Store base price (₹3350 -> ₹2680 with 20% discount)', () => {
    const res = calculatePlanPricing({
      planId: 'quarterly',
      interval: '3 months',
      basePrice: 3350,
      originalPrice: 4500,
      nativePrice: 3350,
      formattedNativePrice: '₹3,350.00',
      currencySymbol: '₹',
      discountPercent: 20,
    });

    expect(res.symbol).toBe('₹');
    expect(res.baseNumPrice).toBe(3350);
    expect(res.effectiveNumPrice).toBe(2680);
    expect(res.strikeThroughNum).toBe(3350);
    expect(res.primaryDisplay).toBe('₹2,680');
    expect(res.cadenceSubtext).toBe('for 3 months');
    // Monthly = 2680 / 3 = 893, Weekly = 2680 / 13 = 206
    expect(res.bracketBreakdown).toBe('(₹893 / month • approx ₹206 / week • Billed every 3 months)');
  });

  it('formats Annual plan correctly with Google Play Store base price (₹11700 -> ₹9360 with 20% discount)', () => {
    const res = calculatePlanPricing({
      planId: 'annual',
      interval: 'year',
      basePrice: 11700,
      originalPrice: 15000,
      nativePrice: 11700,
      formattedNativePrice: '₹11,700.00',
      currencySymbol: '₹',
      discountPercent: 20,
    });

    expect(res.symbol).toBe('₹');
    expect(res.baseNumPrice).toBe(11700);
    expect(res.effectiveNumPrice).toBe(9360);
    expect(res.strikeThroughNum).toBe(11700);
    expect(res.primaryDisplay).toBe('₹9,360');
    expect(res.cadenceSubtext).toBe('/ year');
    // Monthly = 9360 / 12 = 780, Weekly = 9360 / 52 = 180
    expect(res.bracketBreakdown).toBe('(₹780 / month • approx ₹180 / week • Billed annually)');
  });

  it('extracts currency symbol from formatted native price if symbol not provided', () => {
    const res = calculatePlanPricing({
      planId: 'weekly',
      interval: 'week',
      basePrice: 11,
      nativePrice: 11,
      formattedNativePrice: 'A$11.00',
    });

    expect(res.symbol).toBe('A$');
    expect(res.primaryDisplay).toBe('A$11');
  });
});
