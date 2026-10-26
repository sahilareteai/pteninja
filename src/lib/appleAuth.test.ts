import { describe, it, expect } from 'vitest';
import {
  extractAppleCredentials,
  isAppleAuthCancellation,
  createInstantAppleUser,
} from './appleAuth';
import { getLocalDateStr } from './utils';

describe('Apple Authentication Helper Unit Tests', () => {
  describe('extractAppleCredentials', () => {
    it('successfully extracts credentials from standard Capacitor Firebase Auth format', () => {
      const res = {
        credential: {
          idToken: 'sample.apple.jwt.token',
          nonce: 'sample_raw_nonce_123',
          authorizationCode: 'sample_auth_code',
          providerId: 'apple.com',
        },
        user: null,
      };

      const creds = extractAppleCredentials(res);
      expect(creds.idToken).toBe('sample.apple.jwt.token');
      expect(creds.rawNonce).toBe('sample_raw_nonce_123');
      expect(creds.authorizationCode).toBe('sample_auth_code');
    });

    it('successfully extracts credentials when returned at top-level', () => {
      const res = {
        idToken: 'top.level.token',
        nonce: 'top_level_nonce',
      };

      const creds = extractAppleCredentials(res);
      expect(creds.idToken).toBe('top.level.token');
      expect(creds.rawNonce).toBe('top_level_nonce');
      expect(creds.authorizationCode).toBeUndefined();
    });

    it('extracts displayName if returned with credential or user', () => {
      const res = {
        credential: {
          idToken: 'token.123',
        },
        user: {
          displayName: 'Sensei Ninja',
        },
      };

      const creds = extractAppleCredentials(res);
      expect(creds.displayName).toBe('Sensei Ninja');
    });

    it('throws a descriptive error when response is missing', () => {
      expect(() => extractAppleCredentials(null)).toThrow(
        'No authentication response received from Apple.'
      );
      expect(() => extractAppleCredentials(undefined)).toThrow(
        'No authentication response received from Apple.'
      );
    });

    it('throws a descriptive error when idToken is absent or empty', () => {
      expect(() => extractAppleCredentials({})).toThrow(
        'Unable to obtain identity token from Apple. Please try again.'
      );
      expect(() => extractAppleCredentials({ credential: {} })).toThrow(
        'Unable to obtain identity token from Apple. Please try again.'
      );
      expect(() => extractAppleCredentials({ credential: { idToken: '   ' } })).toThrow(
        'Unable to obtain identity token from Apple. Please try again.'
      );
    });
  });

  describe('isAppleAuthCancellation', () => {
    it('detects Apple ASAuthorizationError canceled code 1001', () => {
      expect(isAppleAuthCancellation({ code: '1001' })).toBe(true);
      expect(isAppleAuthCancellation({ errorCode: 1001 })).toBe(true);
      expect(
        isAppleAuthCancellation(new Error('The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)'))
      ).toBe(true);
    });

    it('detects user cancellation strings in message', () => {
      expect(isAppleAuthCancellation(new Error('User canceled the authorization'))).toBe(true);
      expect(isAppleAuthCancellation(new Error('Authorization was cancelled'))).toBe(true);
      expect(isAppleAuthCancellation({ message: 'auth/cancelled-popup-request' })).toBe(true);
      expect(isAppleAuthCancellation({ code: 'auth/popup-closed-by-user' })).toBe(true);
    });

    it('returns false for actual system errors', () => {
      expect(isAppleAuthCancellation(new Error('auth/network-request-failed'))).toBe(false);
      expect(isAppleAuthCancellation(new Error('auth/operation-not-allowed'))).toBe(false);
      expect(isAppleAuthCancellation(new Error('auth/invalid-credential'))).toBe(false);
      expect(isAppleAuthCancellation(null)).toBe(false);
    });
  });

  describe('createInstantAppleUser', () => {
    it('creates a complete, production-ready UserData object for instant Dojo access', () => {
      const now = new Date();
      const todayStr = getLocalDateStr(now);
      const sessionId = 'session_test_xyz789';

      const user = createInstantAppleUser(
        {
          uid: 'apple_uid_456',
          email: 'scholar@example.com',
          displayName: 'Scholar Ninja',
          emailVerified: true,
        },
        sessionId
      );

      expect(user.uid).toBe('apple_uid_456');
      expect(user.email).toBe('scholar@example.com');
      expect(user.displayName).toBe('Scholar Ninja');
      expect(user.accessType).toBe('user');
      expect(user.subscriptionStatus).toBe('trial');
      expect(user.emailVerified).toBe(true);
      expect(user.signupPlatform).toBe('mobile');
      expect(user.currentSessionId).toBe(sessionId);
      expect(user.activityLog).toEqual([todayStr]);
      expect(user.completedTasks).toEqual([]);
      expect(user.completedTasksDetailed).toEqual([]);

      // Verify 7-day trial validity
      const trialEnd = new Date(user.trialEndsAt!);
      const diffDays = Math.round((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(7);
    });

    it('gracefully handles missing displayName and email', () => {
      const user = createInstantAppleUser(
        {
          uid: 'apple_private_uid_999',
          email: null,
          displayName: null,
        },
        'session_123'
      );

      expect(user.displayName).toBe('Ninja Scholar');
      expect(user.email).toBeNull();
      expect(user.accessType).toBe('user');
      expect(user.subscriptionStatus).toBe('trial');
    });

    it('extracts name from email if displayName is not provided by Apple', () => {
      const user = createInstantAppleUser(
        {
          uid: 'apple_uid_777',
          email: 'tarun.ninja@appleid.com',
          displayName: null,
        },
        'session_123'
      );

      expect(user.displayName).toBe('tarun.ninja');
    });
  });

  describe('Version & Build Metadata', () => {
    it('provides valid version and build number for TestFlight verification', async () => {
      const { APP_VERSION, APP_BUILD } = await import('../version');
      expect(APP_VERSION).toBeDefined();
      expect(typeof APP_VERSION).toBe('string');
      expect(APP_BUILD).toBeGreaterThanOrEqual(28);
    });
  });
});
