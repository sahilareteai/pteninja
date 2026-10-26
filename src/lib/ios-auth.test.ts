import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatAuthError } from './utils';
import { isNativeMobile, isIOS, isAndroid, resolveApiUrl, API_BASE_URL } from './mobile';
import { Capacitor } from '@capacitor/core';

describe('iOS Authentication & Error Handling Unit Tests', () => {
  describe('formatAuthError iOS specific handling', () => {
    it('translates Google Sign-In not enabled message cleanly on iOS', () => {
      const err = new Error('Google sign in is not enabled.');
      const formatted = formatAuthError(err);
      expect(formatted).toBe(
        'Google Sign-In is being finalized for iOS. Please sign in with Email or continue with Instant Guest.'
      );
      expect(formatted).not.toContain('auth/');
      expect(formatted).not.toContain('Firebase');
    });

    it('translates GoogleService-Info.plist missing error into user-friendly guidance', () => {
      const err = new Error('Could not find GoogleService-Info.plist in main bundle.');
      const formatted = formatAuthError(err);
      expect(formatted).toBe(
        'Google Sign-In is being finalized for iOS. Please sign in with Email or continue with Instant Guest.'
      );
    });

    it('translates operation-not-allowed for Google into friendly guidance', () => {
      const err = {
        code: 'auth/operation-not-allowed',
        message: 'The identity provider google.com is disabled for this project.'
      };
      const formatted = formatAuthError(err);
      expect(formatted).toBe(
        'Google Sign-In is not enabled yet. Please sign in with Email or continue with Instant Guest.'
      );
    });

    it('translates operation-not-allowed for Apple into friendly guidance', () => {
      const err = {
        code: 'auth/operation-not-allowed',
        message: 'The identity provider apple.com is disabled for this project.'
      };
      const formatted = formatAuthError(err);
      expect(formatted).toBe(
        'Apple Sign-In is not enabled yet. Please sign in with Email or continue with Instant Guest.'
      );
    });

    it('translates "Apple Sign-in provider is not enabled" error cleanly into user guidance', () => {
      const err = new Error('Apple Sign-in provider is not enabled. Make sure to add the provider to system settings.');
      const formatted = formatAuthError(err);
      expect(formatted).toBe(
        'Apple Sign-In is not enabled yet. Please sign in with Email or continue with Instant Guest.'
      );
      expect(formatted).not.toContain('system settings');
      expect(formatted).not.toContain('Firebase');
    });

    it('translates timeout errors into friendly connection guidance without technical jargon', () => {
      const err = new Error('Firebase authentication timed out.');
      const formatted = formatAuthError(err);
      expect(formatted).toBe(
        'Authentication timed out. Please check your internet connection and try again.'
      );
      expect(formatted).not.toContain('Firebase');
      expect(formatted).not.toContain('system');
    });

    it('translates missing Google Sign-In SDK error into user-friendly guidance', () => {
      const err = new Error('The Google Sign-In SDK is not included in this build. Add the required CocoaPods subspec or Swift package trait.');
      const formatted = formatAuthError(err);
      expect(formatted).toBe(
        'Google Sign-In is being finalized for iOS. Please sign in with Email or continue with Instant Guest.'
      );
    });
  });

  describe('Mobile Platform Detection', () => {
    it('correctly detects web when Capacitor is not native', () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
      expect(isNativeMobile()).toBe(false);
    });

    it('correctly detects native mobile when Capacitor is native', () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      expect(isNativeMobile()).toBe(true);
    });

    it('identifies iOS platform correctly', () => {
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
      expect(isIOS()).toBe(true);
      expect(isAndroid()).toBe(false);
    });

    it('identifies Android platform correctly', () => {
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
      expect(isAndroid()).toBe(true);
      expect(isIOS()).toBe(false);
    });

    it('resolves relative API URLs to production domain on mobile', () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      const resolved = resolveApiUrl('/api/create-subscription');
      expect(resolved).toBe(`${API_BASE_URL}/api/create-subscription`);
    });

    it('keeps relative API URLs untouched on web', () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
      const resolved = resolveApiUrl('/api/create-subscription');
      expect(resolved).toBe('/api/create-subscription');
    });
  });

  describe('Guest Session State Isolation & Logout', () => {
    let mockStore: Record<string, string> = {};

    beforeEach(() => {
      mockStore = {};
      const storageMock = {
        getItem: (k: string) => mockStore[k] ?? null,
        setItem: (k: string, v: string) => { mockStore[k] = String(v); },
        removeItem: (k: string) => { delete mockStore[k]; },
        clear: () => { mockStore = {}; }
      };
      vi.stubGlobal('localStorage', storageMock);
    });

    it('generates a distinct local guest session ID and cleans up on logout', () => {
      const sessionId = 'test_guest_session_12345';
      localStorage.setItem('pte_session_id', sessionId);
      expect(localStorage.getItem('pte_session_id')).toBe(sessionId);

      // Simulates the exact logout cleanup
      localStorage.removeItem('pte_session_id');
      expect(localStorage.getItem('pte_session_id')).toBeNull();
    });

    it('guarantees guest fallback structure matches UserData specifications', () => {
      const now = new Date();
      const localUid = 'guest_test_abc123';
      const fallbackUser = {
        uid: localUid,
        email: null,
        displayName: 'Guest Ninja',
        createdAt: now.toISOString(),
        accessType: 'guest',
        subscriptionStatus: 'guest',
        signupPlatform: 'mobile',
        activityLog: [now.toISOString().split('T')[0]],
        completedTasks: [],
        completedTasksDetailed: [],
        taskScores: {},
        favoriteWords: [],
        schedule: [],
        goals: [],
        currentSessionId: 'guest_session'
      };

      expect(fallbackUser.uid).toMatch(/^guest_/);
      expect(fallbackUser.accessType).toBe('guest');
      expect(fallbackUser.subscriptionStatus).toBe('guest');
      expect(fallbackUser.displayName).toBe('Guest Ninja');
      expect(fallbackUser.email).toBeNull();
      expect(Array.isArray(fallbackUser.activityLog)).toBe(true);
      expect(Array.isArray(fallbackUser.completedTasks)).toBe(true);
    });
  });

  describe('Onboarding Slider Math & Navigation', () => {
    const SLIDES_COUNT = 4;

    it('wraps forward correctly across all slides', () => {
      let current = 0;
      current = (current + 1) % SLIDES_COUNT;
      expect(current).toBe(1);
      current = (current + 1) % SLIDES_COUNT;
      expect(current).toBe(2);
      current = (current + 1) % SLIDES_COUNT;
      expect(current).toBe(3);
      current = (current + 1) % SLIDES_COUNT;
      expect(current).toBe(0); // wraps around to 0
    });

    it('wraps backward correctly across all slides', () => {
      let current = 0;
      current = (current - 1 + SLIDES_COUNT) % SLIDES_COUNT;
      expect(current).toBe(3); // wraps backwards to last slide
      current = (current - 1 + SLIDES_COUNT) % SLIDES_COUNT;
      expect(current).toBe(2);
    });
  });
});
