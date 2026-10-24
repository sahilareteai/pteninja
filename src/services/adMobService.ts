import {
  AdMob,
  BannerAdOptions,
  BannerAdPosition,
  BannerAdSize,
  BannerAdPluginEvents,
  AdOptions,
  InterstitialAdPluginEvents,
  RewardAdOptions,
  RewardAdPluginEvents,
  AdMobRewardItem,
} from '@capacitor-community/admob';
import { isNativeMobile } from '../lib/mobile';

export const ADMOB_IDS = {
  appId: 'ca-app-pub-9025413323620577~6223975956',
  banner: 'ca-app-pub-9025413323620577/3517921563',
  interstitial: 'ca-app-pub-9025413323620577/7321435201',
  rewarded: 'ca-app-pub-9025413323620577/3892618247',
};

// Google official sample/test IDs for safe fallback during development
export const ADMOB_TEST_IDS = {
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

class AdMobService {
  private isInitialized = false;
  private isBannerShowing = false;
  private isInterstitialPrepared = false;
  private isRewardedPrepared = false;
  private lastInterstitialTime = 0;
  private minInterstitialIntervalMs = 90 * 1000; // At least 90s between interstitial ads

  /**
   * Initializes AdMob SDK if running on native mobile.
   */
  async initialize(): Promise<void> {
    if (!isNativeMobile() || this.isInitialized) {
      return;
    }

    try {
      await AdMob.initialize({
        testingDevices: [],
        initializeForTesting: false,
      });

      this.isInitialized = true;
      console.log('✅ AdMob SDK successfully initialized');

      // Setup listeners for interstitial and rewarded ads
      AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => {
        this.isInterstitialPrepared = true;
      });

      AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
        this.isInterstitialPrepared = false;
        // Preload next interstitial ad
        this.prepareInterstitial().catch(() => {});
      });

      AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (err) => {
        console.warn('AdMob Interstitial failed to load:', err);
        this.isInterstitialPrepared = false;
      });

      AdMob.addListener(RewardAdPluginEvents.Loaded, () => {
        this.isRewardedPrepared = true;
      });

      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        this.isRewardedPrepared = false;
        // Preload next rewarded ad
        this.prepareRewarded().catch(() => {});
      });

      AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err) => {
        console.warn('AdMob Rewarded ad failed to load:', err);
        this.isRewardedPrepared = false;
      });

      // Preload initial interstitial & rewarded ads
      setTimeout(() => {
        this.prepareInterstitial().catch(() => {});
        this.prepareRewarded().catch(() => {});
      }, 3000);
    } catch (error) {
      console.error('Failed to initialize AdMob SDK:', error);
    }
  }

  /**
   * Shows the bottom banner ad.
   * Automatically suppressed if the user is a Pro subscriber.
   */
  async showBanner(isProSubscriber: boolean): Promise<void> {
    if (!isNativeMobile()) return;
    if (isProSubscriber) {
      // Subscribers never see banner ads
      if (this.isBannerShowing) {
        await this.hideBanner();
      }
      return;
    }

    if (this.isBannerShowing) return;

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const options: BannerAdOptions = {
        adId: ADMOB_IDS.banner,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 0,
        isTesting: false,
      };

      await AdMob.showBanner(options);
      this.isBannerShowing = true;
    } catch (error) {
      console.warn('AdMob showBanner warning:', error);
    }
  }

  /**
   * Hides and removes the banner ad (e.g. when user upgrades or enters full-screen exam).
   */
  async hideBanner(): Promise<void> {
    if (!isNativeMobile() || !this.isBannerShowing) return;

    try {
      await AdMob.hideBanner();
      await AdMob.removeBanner();
      this.isBannerShowing = false;
    } catch (error) {
      console.warn('AdMob hideBanner warning:', error);
    }
  }

  /**
   * Pre-fetches the interstitial ad into memory so it opens instantly when triggered.
   */
  async prepareInterstitial(): Promise<void> {
    if (!isNativeMobile()) return;
    try {
      if (!this.isInitialized) await this.initialize();

      const options: AdOptions = {
        adId: ADMOB_IDS.interstitial,
        isTesting: false,
      };

      await AdMob.prepareInterstitial(options);
      this.isInterstitialPrepared = true;
    } catch (error) {
      console.warn('AdMob prepareInterstitial error:', error);
      this.isInterstitialPrepared = false;
    }
  }

  /**
   * Displays full-screen interstitial ad (e.g. after completing a practice test).
   * Automatically suppressed for Pro subscribers.
   */
  async showInterstitial(isProSubscriber: boolean): Promise<boolean> {
    if (!isNativeMobile() || isProSubscriber) return false;

    const now = Date.now();
    if (now - this.lastInterstitialTime < this.minInterstitialIntervalMs) {
      // Don't overwhelm the user with ads too frequently
      return false;
    }

    try {
      if (!this.isInterstitialPrepared) {
        await this.prepareInterstitial();
      }

      await AdMob.showInterstitial();
      this.lastInterstitialTime = Date.now();
      return true;
    } catch (error) {
      console.warn('AdMob showInterstitial error:', error);
      // Preload next attempt
      this.prepareInterstitial().catch(() => {});
      return false;
    }
  }

  /**
   * Pre-fetches the rewarded video ad.
   */
  async prepareRewarded(): Promise<void> {
    if (!isNativeMobile()) return;
    try {
      if (!this.isInitialized) await this.initialize();

      const options: RewardAdOptions = {
        adId: ADMOB_IDS.rewarded,
        isTesting: false,
      };

      await AdMob.prepareRewardVideoAd(options);
      this.isRewardedPrepared = true;
    } catch (error) {
      console.warn('AdMob prepareRewarded error:', error);
      this.isRewardedPrepared = false;
    }
  }

  /**
   * Shows a rewarded ad. When completed, calls `onReward(item)`.
   * Used for "Watch ad to unlock 1 Free AI Evaluation" or extra questions.
   */
  async showRewarded(onReward: (item: AdMobRewardItem) => void): Promise<boolean> {
    if (!isNativeMobile()) {
      // On web fallback or preview, grant reward directly
      onReward({ amount: 1, type: 'credit' });
      return true;
    }

    try {
      if (!this.isRewardedPrepared) {
        await this.prepareRewarded();
      }

      // Single-use listener for reward completion
      const rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, (rewardItem: AdMobRewardItem) => {
        onReward(rewardItem);
        rewardListener.remove();
      });

      await AdMob.showRewardVideoAd();
      return true;
    } catch (error) {
      console.warn('AdMob showRewarded error:', error);
      this.prepareRewarded().catch(() => {});
      return false;
    }
  }
}

export const adMobService = new AdMobService();
