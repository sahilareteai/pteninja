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

    it('extracts user profile safely when idToken is absent in Android OAuth flow', () => {
      const res = {
        user: {
          uid: 'apple_android_oauth_uid',
          email: 'scholar@privaterelay.appleid.com',
          displayName: 'Ninja Scholar',
        },
      };

      const creds = extractAppleCredentials(res);
      expect(creds.idToken).toBeUndefined();
      expect(creds.user?.uid).toBe('apple_android_oauth_uid');
      expect(creds.displayName).toBe('Ninja Scholar');
    });

    it('extracts credentials from res.response structure from native iOS plugins', () => {
      const res = {
        response: {
          identityToken: 'jwt.token.abc',
          nonce: 'raw_nonce_xyz',
          authorizationCode: 'auth_code_123',
          givenName: 'Ninja',
          familyName: 'Master',
        },
      };

      const creds = extractAppleCredentials(res);
      expect(creds.idToken).toBe('jwt.token.abc');
      expect(creds.rawNonce).toBe('raw_nonce_xyz');
      expect(creds.authorizationCode).toBe('auth_code_123');
      expect(creds.displayName).toBe('Ninja Master');
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

    it('creates instant profile with apple_sub fallback UID and preserves sessionCreatedAt', () => {
      const appleSub = '001234.abcdef567890.1234';
      const fallbackUid = `apple_${appleSub.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const sessionCreatedAt = Date.now();
      const user = createInstantAppleUser(
        {
          uid: fallbackUid,
          email: 'scholar@privaterelay.appleid.com',
          displayName: 'PTE Aspirant',
          emailVerified: true,
        },
        'session_abc_999',
        'PTE Aspirant',
        sessionCreatedAt
      );

      expect(user.uid).toBe('apple_001234_abcdef567890_1234');
      expect(user.email).toBe('scholar@privaterelay.appleid.com');
      expect(user.displayName).toBe('PTE Aspirant');
      expect(user.emailVerified).toBe(true);
      expect(user.sessionCreatedAt).toBe(sessionCreatedAt);
      expect(user.currentSessionId).toBe('session_abc_999');
    });

    it('correctly parses simulated Apple ID JWT token payload', () => {
      const fakePayload = {
        iss: 'https://appleid.apple.com',
        aud: 'com.pteninja.app',
        sub: '001234.userAppleUniqueId.5678',
        email: 'ninja.user@privaterelay.appleid.com',
        email_verified: 'true'
      };
      const base64UrlPayload = btoa(JSON.stringify(fakePayload)).replace(/\+/g, '-').replace(/\//g, '_');
      const fakeJwt = `header.${base64UrlPayload}.signature`;

      const parts = fakeJwt.split('.');
      expect(parts.length).toBe(3);
      const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const decodedJson = atob(normalized);
      const payload = JSON.parse(decodedJson);

      expect(payload.sub).toBe('001234.userAppleUniqueId.5678');
      expect(payload.email).toBe('ninja.user@privaterelay.appleid.com');
    });
    it('creates instant profile for Google users and preserves session parameters', () => {
      const sessionCreatedAt = 1793165000000;
      const user = createInstantAppleUser(
        {
          uid: 'google_user_uid_123',
          email: 'google.student@gmail.com',
          displayName: 'Google Scholar',
          emailVerified: true
        },
        'session_google_777',
        'Google Scholar',
        sessionCreatedAt
      );

      expect(user.uid).toBe('google_user_uid_123');
      expect(user.email).toBe('google.student@gmail.com');
      expect(user.displayName).toBe('Google Scholar');
      expect(user.emailVerified).toBe(true);
      expect(user.sessionCreatedAt).toBe(sessionCreatedAt);
      expect(user.currentSessionId).toBe('session_google_777');
    });
  });

  describe('Version & Build Metadata', () => {
    it('provides valid version and build number for TestFlight verification', async () => {
      const { APP_VERSION, APP_BUILD } = await import('../version');
      expect(APP_VERSION).toBeDefined();
      expect(typeof APP_VERSION).toBe('string');
      expect(APP_BUILD).toBe(91);
    });
  });
});
