import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { adMobService } from './adMobService';
import * as mobileModule from '../lib/mobile';
import { AdMob } from '@capacitor-community/admob';

vi.mock('@capacitor-community/admob', () => ({
  AdMob: {
    initialize: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(),
    showBanner: vi.fn().mockResolvedValue(undefined),
    hideBanner: vi.fn().mockResolvedValue(undefined),
    removeBanner: vi.fn().mockResolvedValue(undefined),
    prepareInterstitial: vi.fn().mockResolvedValue(undefined),
    showInterstitial: vi.fn().mockResolvedValue(undefined),
    prepareRewardVideoAd: vi.fn().mockResolvedValue(undefined),
    showRewardVideoAd: vi.fn().mockResolvedValue(undefined),
  },
  BannerAdSize: { ADAPTIVE_BANNER: 'ADAPTIVE_BANNER' },
  BannerAdPosition: { BOTTOM_CENTER: 'BOTTOM_CENTER' },
  BannerAdPluginEvents: { SizeChanged: 'sizeChanged', Loaded: 'loaded', FailedToLoad: 'failedToLoad' },
  InterstitialAdPluginEvents: { Loaded: 'loaded', Dismissed: 'dismissed', FailedToLoad: 'failedToLoad' },
  RewardAdPluginEvents: { Loaded: 'loaded', Dismissed: 'dismissed', FailedToLoad: 'failedToLoad' },
}));

describe('AdMobService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(mobileModule, 'isNativeMobile').mockReturnValue(true);
    vi.spyOn(mobileModule, 'isIOS').mockReturnValue(true);
    // Reset private lastInterstitialTime through prototype or initialization
    (adMobService as any).lastInterstitialTime = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Interstitial Ad Cooldown & Timing Rules', () => {
    it('suppresses interstitial ad for Pro subscribers completely', async () => {
      const shown = await adMobService.showInterstitial(true);
      expect(shown).toBe(false);
      expect(AdMob.showInterstitial).not.toHaveBeenCalled();
    });

    it('suppresses interstitial ad when on web browser', async () => {
      vi.spyOn(mobileModule, 'isNativeMobile').mockReturnValue(false);
      const shown = await adMobService.showInterstitial(false);
      expect(shown).toBe(false);
      expect(AdMob.showInterstitial).not.toHaveBeenCalled();
    });

    it('shows interstitial ad for free users when cooldown has passed', async () => {
      (adMobService as any).lastInterstitialTime = 0;
      const shown = await adMobService.showInterstitial(false);
      expect(shown).toBe(true);
      expect(AdMob.showInterstitial).toHaveBeenCalled();
    });

    it('strictly suppresses interstitial ad if called within the 2-minute cooldown', async () => {
      const startTime = 1000000;
      vi.spyOn(Date, 'now').mockReturnValue(startTime);

      // First ad shows successfully
      const firstShow = await adMobService.showInterstitial(false);
      expect(firstShow).toBe(true);

      // 60 seconds later (under 2 minutes / 120s limit) -> MUST be suppressed!
      vi.spyOn(Date, 'now').mockReturnValue(startTime + 60_000);
      const secondShow = await adMobService.showInterstitial(false);
      expect(secondShow).toBe(false);

      // 119 seconds later (still under 120s) -> MUST be suppressed!
      vi.spyOn(Date, 'now').mockReturnValue(startTime + 119_000);
      const thirdShow = await adMobService.showInterstitial(false);
      expect(thirdShow).toBe(false);

      // 121 seconds later (exceeded 2 minutes) -> Should allow ad
      vi.spyOn(Date, 'now').mockReturnValue(startTime + 121_000);
      const fourthShow = await adMobService.showInterstitial(false);
      expect(fourthShow).toBe(true);
    });
  });

  describe('Banner Placement & Height Tracking', () => {
    it('notifies banner height listeners without inflating gaps', () => {
      const heights: number[] = [];
      const unsubscribe = adMobService.onBannerHeightChange((h) => heights.push(h));

      (adMobService as any).notifyBannerListeners(50);
      (adMobService as any).notifyBannerListeners(0);

      expect(heights).toContain(50);
      expect(heights).toContain(0);
      unsubscribe();
    });

    it('hides banner cleanly when user is Pro subscriber', async () => {
      (adMobService as any).isBannerShowing = true;
      await adMobService.showBanner(true);
      expect(AdMob.hideBanner).toHaveBeenCalled();
      expect((adMobService as any).isBannerShowing).toBe(false);
    });
  });
});
