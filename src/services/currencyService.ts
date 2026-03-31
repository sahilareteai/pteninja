import { SUBSCRIPTION_PLANS } from '../types';

export interface CurrencyInfo {
  code: string;
  symbol: string;
  rate: number; // Rate relative to USD
  name: string;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyInfo> = {
  AUD: { code: 'AUD', symbol: 'A$', rate: 1, name: 'Australian Dollar' },
  USD: { code: 'USD', symbol: '$', rate: 0.66, name: 'US Dollar' },
  EUR: { code: 'EUR', symbol: '€', rate: 0.61, name: 'Euro' },
  GBP: { code: 'GBP', symbol: '£', rate: 0.52, name: 'British Pound' },
  INR: { code: 'INR', symbol: '₹', rate: 55.0, name: 'Indian Rupee' },
  CAD: { code: 'CAD', symbol: 'C$', rate: 0.89, name: 'Canadian Dollar' },
  SGD: { code: 'SGD', symbol: 'S$', rate: 0.88, name: 'Singapore Dollar' },
  CNY: { code: 'CNY', symbol: '¥', rate: 4.75, name: 'Chinese Yuan' },
  JPY: { code: 'JPY', symbol: '¥', rate: 99.5, name: 'Japanese Yen' },
};

export class CurrencyService {
  private static currentCurrency: CurrencyInfo = SUPPORTED_CURRENCIES.AUD;
  private static isInitialized = false;

  static async initialize() {
    if (this.isInitialized) return;

    try {
      // Try to detect user's country and currency via IP
      try {
        const response = await fetch('https://ipapi.co/json/');
        if (response.ok) {
          const data = await response.json();
          if (data.currency && SUPPORTED_CURRENCIES[data.currency]) {
            this.currentCurrency = SUPPORTED_CURRENCIES[data.currency];
          }
        }
      } catch (e) {
        // Silent fail for IP detection, will use fallback
      }
      
      if (!this.currentCurrency || this.currentCurrency === SUPPORTED_CURRENCIES.AUD) {
        // Fallback to browser locale
        const locale = navigator.language;
        const currencyMap: Record<string, string> = {
          'en-GB': 'GBP',
          'en-AU': 'AUD',
          'en-CA': 'CAD',
          'en-SG': 'SGD',
          'en-IN': 'INR',
          'hi-IN': 'INR',
          'de-DE': 'EUR',
          'fr-FR': 'EUR',
          'it-IT': 'EUR',
          'es-ES': 'EUR',
          'zh-CN': 'CNY',
          'ja-JP': 'JPY',
        };

        const detectedCode = currencyMap[locale];
        if (detectedCode && SUPPORTED_CURRENCIES[detectedCode]) {
          this.currentCurrency = SUPPORTED_CURRENCIES[detectedCode];
        }
      }

      // Optionally fetch real-time rates
      try {
        const rateResponse = await fetch('https://open.er-api.com/v6/latest/AUD');
        if (rateResponse.ok) {
          const rateData = await rateResponse.json();
          if (rateData.result === 'success' && rateData.rates) {
            Object.keys(SUPPORTED_CURRENCIES).forEach(code => {
              if (rateData.rates[code]) {
                SUPPORTED_CURRENCIES[code].rate = rateData.rates[code];
              }
            });
            // Update current currency rate if it was changed
            if (SUPPORTED_CURRENCIES[this.currentCurrency.code]) {
              this.currentCurrency = SUPPORTED_CURRENCIES[this.currentCurrency.code];
            }
          }
        }
      } catch (e) {
        // Silent fail for real-time rates, using fallbacks
      }

    } catch (error) {
      // Final catch-all, should not happen with the inner try-catches
    } finally {
      this.isInitialized = true;
    }
  }

  static getCurrentCurrency(): CurrencyInfo {
    return this.currentCurrency;
  }

  static convert(baseAmount: number): number {
    return Math.round(baseAmount * this.currentCurrency.rate);
  }

  static format(amount: number, currencyCode?: string): string {
    const currency = currencyCode ? (SUPPORTED_CURRENCIES[currencyCode] || this.currentCurrency) : this.currentCurrency;
    
    return new Intl.NumberFormat(navigator.language, {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  static getPlanPrice(planId: string): { price: number; originalPrice: number; formattedPrice: string; formattedOriginalPrice: string } {
    const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
    if (!plan) return { price: 0, originalPrice: 0, formattedPrice: '$0', formattedOriginalPrice: '$0' };

    const convertedPrice = this.convert(plan.price);
    const convertedOriginalPrice = this.convert(plan.originalPrice);

    return {
      price: convertedPrice,
      originalPrice: convertedOriginalPrice,
      formattedPrice: this.format(convertedPrice),
      formattedOriginalPrice: this.format(convertedOriginalPrice)
    };
  }
}
