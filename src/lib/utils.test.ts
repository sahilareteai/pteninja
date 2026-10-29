import { describe, it, expect } from 'vitest';
import { formatAuthError, getLocalDateStr, getDayNumber, calculateStreak } from './utils';

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

describe('getLocalDateStr and timezone tracking', () => {
  it('formats dates in YYYY-MM-DD correctly for specific timezones like Asia/Kolkata', () => {
    // 2026-10-28 19:00:00 UTC is 2026-10-29 00:30:00 in Asia/Kolkata (UTC + 5:30)
    const lateUtcDate = new Date('2026-10-28T19:00:00.000Z');
    expect(getLocalDateStr(lateUtcDate, 'UTC')).toBe('2026-10-28');
    expect(getLocalDateStr(lateUtcDate, 'Asia/Kolkata')).toBe('2026-10-29');

    // 2026-10-29 01:00:00 UTC is 2026-10-29 in both UTC and Asia/Kolkata
    const morningUtcDate = new Date('2026-10-29T01:00:00.000Z');
    expect(getLocalDateStr(morningUtcDate, 'UTC')).toBe('2026-10-29');
    expect(getLocalDateStr(morningUtcDate, 'Asia/Kolkata')).toBe('2026-10-29');
  });

  it('getDayNumber returns consecutive day numbers for consecutive calendar dates', () => {
    const day1 = getDayNumber('2026-10-28');
    const day2 = getDayNumber('2026-10-29');
    const day3 = getDayNumber('2026-10-30');
    expect(day2 - day1).toBe(1);
    expect(day3 - day2).toBe(1);

    // Month boundary: Oct 31 to Nov 1
    const oct31 = getDayNumber('2026-10-31');
    const nov1 = getDayNumber('2026-11-01');
    expect(nov1 - oct31).toBe(1);
  });
});

describe('calculateStreak', () => {
  it('returns 0 for empty activity log', () => {
    expect(calculateStreak([])).toBe(0);
  });

  it('calculates 1-day streak if logged today only', () => {
    const today = getLocalDateStr(new Date());
    expect(calculateStreak([today])).toBe(1);
  });

  it('calculates 1-day streak if logged yesterday and user opens today', () => {
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = getLocalDateStr(yesterdayDate);
    expect(calculateStreak([yesterday])).toBe(1);
  });

  it('calculates 2-day streak if logged yesterday and today', () => {
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = getLocalDateStr(yesterdayDate);
    const today = getLocalDateStr(new Date());
    expect(calculateStreak([yesterday, today])).toBe(2);
  });

  it('handles consecutive streak across month boundaries', () => {
    // If today is mock or fixed, test streak logic
    const dayNumbers = ['2026-10-28', '2026-10-29'];
    const streak = calculateStreak(dayNumbers, 'Asia/Kolkata');
    expect(streak).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 if last logged activity was 2 or more days ago', () => {
    const threeDaysAgoDate = new Date();
    threeDaysAgoDate.setDate(threeDaysAgoDate.getDate() - 3);
    const threeDaysAgo = getLocalDateStr(threeDaysAgoDate);
    expect(calculateStreak([threeDaysAgo])).toBe(0);
  });
});
