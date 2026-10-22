import { describe, it, expect } from 'vitest';
import { formatAuthError } from './utils';

describe('formatAuthError', () => {
  it('translates auth/account-exists-with-different-credential into clear non-technical text', () => {
    const errorObj = {
      code: 'auth/account-exists-with-different-credential',
      message: 'Firebase: Error (auth/account-exists-with-different-credential).',
    };
    const message = formatAuthError(errorObj);
    expect(message).toBe(
      'This mobile number is already linked to another account. Please use a different phone number or sign in with the account using this number.'
    );
    expect(message).not.toContain('Firebase');
    expect(message).not.toContain('auth/');
  });

  it('translates auth/credential-already-in-use', () => {
    const errorObj = {
      code: 'auth/credential-already-in-use',
      message: 'Firebase: Error (auth/credential-already-in-use).',
    };
    const message = formatAuthError(errorObj);
    expect(message).toContain('already linked to another account');
  });

  it('translates raw string error containing error code', () => {
    const rawError = 'Firebase: Error (auth/account-exists-with-different-credential).';
    const message = formatAuthError(rawError);
    expect(message).toBe(
      'This mobile number is already linked to another account. Please use a different phone number or sign in with the account using this number.'
    );
  });

  it('translates invalid-verification-code', () => {
    const message = formatAuthError({ code: 'auth/invalid-verification-code' });
    expect(message).toBe(
      'The 6-digit SMS verification code is incorrect. Please check the code and try again.'
    );
  });

  it('translates code-expired', () => {
    const message = formatAuthError({ code: 'auth/code-expired' });
    expect(message).toBe('The SMS verification code has expired. Please request a new code.');
  });

  it('translates invalid-phone-number', () => {
    const message = formatAuthError({ code: 'auth/invalid-phone-number' });
    expect(message).toContain('Please enter a valid mobile number with country code');
  });

  it('translates operation-not-allowed', () => {
    const message = formatAuthError({ code: 'auth/operation-not-allowed' });
    expect(message).toContain('SMS verification is currently unavailable for this region');
  });

  it('strips any Firebase jargon from unknown errors', () => {
    const message = formatAuthError('Firebase: Something strange happened in Firebase Console.');
    expect(message).not.toContain('Firebase');
    expect(message).not.toContain('Firebase Console');
  });
});
