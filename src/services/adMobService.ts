import {
  AdMob,
  BannerAdPosition,
  BannerAdSize,
  BannerAdPluginEvents,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
  AdMobRewardItem,
  AdMobBannerSize,
} from '@capacitor-community/admob';
import { isNativeMobile, isIOS } from '../lib/mobile';

export const ADMOB_IDS_ANDROID = {
  appId: 'ca-app-pub-9025413323620577~6223975956',
  banner: 'ca-app-pub-9025413323620577/3517921563',
  interstitial: 'ca-app-pub-9025413323620577/7321435201',
  rewarded: 'ca-app-pub-9025413323620577/3892618247',
};

export const ADMOB_IDS_IOS = {
  appId: 'ca-app-pub-9025413323620577~7843646554',
  banner: 'ca-app-pub-9025413323620577/7652074864',
  interstitial: 'ca-app-pub-9025413323620577/5025911529',
  rewarded: '',
};

export const ADMOB_IDS = {
  get appId() {
    return isIOS() ? ADMOB_IDS_IOS.appId : ADMOB_IDS_ANDROID.appId;
  },
  get banner() {
    return isIOS() ? ADMOB_IDS_IOS.banner : ADMOB_IDS_ANDROID.banner;
  },
  get interstitial() {
    return isIOS() ? (ADMOB_IDS_IOS.interstitial || ADMOB_TEST_IDS.interstitial) : ADMOB_IDS_ANDROID.interstitial;
  },
  get rewarded() {
    return isIOS() ? (ADMOB_IDS_IOS.rewarded || ADMOB_TEST_IDS.rewarded) : ADMOB_IDS_ANDROID.rewarded;
  },
};

// Google official sample/test IDs for instant display while live IDs activate (platform-aware)
export const ADMOB_TEST_IDS = {
  get banner() {
    return isIOS() ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111';
  },
  get interstitial() {
    return isIOS() ? 'ca-app-pub-3940256099942544/4411468910' : 'ca-app-pub-3940256099942544/1033173712';
  },
  get rewarded() {
    return isIOS() ? 'ca-app-pub-3940256099942544/1712485313' : 'ca-app-pub-3940256099942544/5224354917';
  },
};

class AdMobService {
  private isInitialized = false;
  private isBannerShowing = false;
  private bannerHeight = 0;
  private bannerListeners: Array<(height: number) => void> = [];
  private isInterstitialPrepared = false;
  private isRewardedPrepared = false;

  /**
   * Register a callback to listen for banner height changes
   * so UI components (like bottom navigation bar) can lift above it.
   */
  onBannerHeightChange(listener: (height: number) => void): () => void {
    this.bannerListeners.push(listener);
    listener(this.bannerHeight);
    return () => {
      this.bannerListeners = this.bannerListeners.filter(l => l !== listener);
    };
  }

  private notifyBannerListeners(h: number) {
    this.bannerHeight = h;
    this.bannerListeners.forEach(fn => fn(h));
  }

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

      // Banner size listener
      AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size: AdMobBannerSize) => {
        if (size && size.height > 0) {
          this.notifyBannerListeners(size.height);
        }
      });

      AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
        this.isBannerShowing = true;
        this.notifyBannerListeners(this.bannerHeight || 56);
      });

      // Interstitial listeners
      AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => {
        this.isInterstitialPrepared = true;
      });

      AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
        this.isInterstitialPrepared = false;
        this.prepareInterstitial().catch(() => {});
      });

      AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (err) => {
        console.warn('AdMob Interstitial failed to load:', err);
        this.isInterstitialPrepared = false;
      });

      // Rewarded listeners
      AdMob.addListener(RewardAdPluginEvents.Loaded, () => {
        this.isRewardedPrepared = true;
      });

      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        this.isRewardedPrepared = false;
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
      }, 2000);
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
      if (this.isBannerShowing) {
        await this.hideBanner();
      }
      return;
    }

    if (this.isBannerShowing) {
      this.notifyBannerListeners(this.bannerHeight || 56);
      return;
    }

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Immediately lift bottom navigation so buttons are never covered
      this.notifyBannerListeners(56);

      try {
        await AdMob.showBanner({
          adId: ADMOB_IDS.banner,
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: false,
        });
      } catch (liveErr) {
        console.warn('Live banner failed, using test banner while AdMob activates:', liveErr);
        await AdMob.showBanner({
          adId: ADMOB_TEST_IDS.banner,
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: true,
        });
      }

      this.isBannerShowing = true;
    } catch (error) {
      console.warn('AdMob showBanner warning:', error);
    }
  }

  /**
   * Hides and removes the banner ad (e.g. when user upgrades or enters full-screen exam).
   */
  async hideBanner(): Promise<void> {
    if (!isNativeMobile()) return;

    try {
      await AdMob.hideBanner().catch(() => {});
      await AdMob.removeBanner().catch(() => {});
      this.isBannerShowing = false;
      this.notifyBannerListeners(0);
    } catch (error) {
      console.warn('AdMob hideBanner warning:', error);
      this.notifyBannerListeners(0);
    }
  }

  /**
   * Pre-fetches the interstitial ad into memory so it opens instantly when triggered.
   */
  async prepareInterstitial(): Promise<void> {
    if (!isNativeMobile()) return;
    try {
      if (!this.isInitialized) await this.initialize();

      try {
        await AdMob.prepareInterstitial({
          adId: ADMOB_IDS.interstitial,
          isTesting: false,
        });
        this.isInterstitialPrepared = true;
      } catch (liveErr) {
        // Fallback to test ID while new ad unit propagates
        await AdMob.prepareInterstitial({
          adId: ADMOB_TEST_IDS.interstitial,
          isTesting: true,
        });
        this.isInterstitialPrepared = true;
      }
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

    try {
      if (!this.isInterstitialPrepared) {
        await this.prepareInterstitial();
      }

      await AdMob.showInterstitial();
      this.isInterstitialPrepared = false;
      this.prepareInterstitial().catch(() => {});
      return true;
    } catch (error) {
      console.warn('AdMob showInterstitial error, attempting fallback:', error);
      try {
        await AdMob.prepareInterstitial({
          adId: ADMOB_TEST_IDS.interstitial,
          isTesting: true,
        });
        await AdMob.showInterstitial();
        this.isInterstitialPrepared = false;
        return true;
      } catch (testErr) {
        console.warn('Fallback interstitial failed:', testErr);
        return false;
      }
    }
  }

  /**
   * Pre-fetches the rewarded video ad.
   */
  async prepareRewarded(): Promise<void> {
    if (!isNativeMobile()) return;
    try {
      if (!this.isInitialized) await this.initialize();

      try {
        await AdMob.prepareRewardVideoAd({
          adId: ADMOB_IDS.rewarded,
          isTesting: false,
        });
        this.isRewardedPrepared = true;
      } catch (liveErr) {
        // Fallback to test ID while new ad unit propagates
        await AdMob.prepareRewardVideoAd({
          adId: ADMOB_TEST_IDS.rewarded,
          isTesting: true,
        });
        this.isRewardedPrepared = true;
      }
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

      const rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, (rewardItem: AdMobRewardItem) => {
        onReward(rewardItem);
        rewardListener.remove();
      });

      await AdMob.showRewardVideoAd();
      this.isRewardedPrepared = false;
      this.prepareRewarded().catch(() => {});
      return true;
    } catch (error) {
      console.warn('AdMob showRewarded error, attempting fallback:', error);
      try {
        await AdMob.prepareRewardVideoAd({
          adId: ADMOB_TEST_IDS.rewarded,
          isTesting: true,
        });

        const rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, (rewardItem: AdMobRewardItem) => {
          onReward(rewardItem);
          rewardListener.remove();
        });

        await AdMob.showRewardVideoAd();
        this.isRewardedPrepared = false;
        this.prepareRewarded().catch(() => {});
        return true;
      } catch (fallbackErr) {
        console.warn('Fallback rewarded ad failed:', fallbackErr);
        return false;
      }
    }
  }
}

export const adMobService = new AdMobService();
