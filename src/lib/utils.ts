import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resolves the user's local timezone (e.g. 'Asia/Kolkata' for India).
 */
export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Returns the date as a YYYY-MM-DD string in the specified or detected timezone.
 * Uses 'en-CA' locale which is ISO-like (YYYY-MM-DD) according to the timezone.
 */
export function getLocalDateStr(date: Date = new Date(), timeZone?: string): string {
  const tz = timeZone || getUserTimeZone();
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  } catch {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

/**
 * Converts a YYYY-MM-DD string into an integer day number using Date.UTC.
 * Consecutive calendar days always have a difference of exactly 1,
 * immune to local daylight savings time, midnight shifts, or leap seconds.
 */
export function getDayNumber(dateStr: string): number {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const parts = dateStr.trim().split('-');
  if (parts.length < 3) return 0;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return 0;
  return Math.floor(Date.UTC(y, m - 1, d) / (1000 * 60 * 60 * 24));
}

/**
 * Calculates the active study streak based on an array of YYYY-MM-DD activity logs.
 * Supports timezone matching and treats activity today or yesterday as an active streak.
 */
export function calculateStreak(activityLog: string[] = [], timeZone?: string): number {
  if (!activityLog || !Array.isArray(activityLog) || activityLog.length === 0) return 0;

  const todayStr = getLocalDateStr(new Date(), timeZone);
  const todayDayNum = getDayNumber(todayStr);

  // Extract unique valid day numbers and sort descending (newest first)
  const dayNumbers = Array.from(
    new Set(
      activityLog
        .filter(s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.trim()))
        .map(s => getDayNumber(s.trim()))
        .filter(num => num > 0)
    )
  ).sort((a, b) => b - a);

  if (dayNumbers.length === 0) return 0;

  const newestDay = dayNumbers[0];

  // If the newest logged day is today or yesterday, the streak is alive!
  // If the last activity was 2 or more days ago, the streak is broken.
  let expectedDay: number;
  if (newestDay === todayDayNum) {
    expectedDay = todayDayNum;
  } else if (newestDay === todayDayNum - 1) {
    expectedDay = todayDayNum - 1;
  } else {
    return 0;
  }

  let streak = 0;
  for (const dayNum of dayNumbers) {
    if (dayNum === expectedDay) {
      streak++;
      expectedDay--;
    } else if (dayNum < expectedDay) {
      // Day missed in between -> streak ends
      break;
    }
  }

  return streak;
}

/**
 * Translates Firebase Authentication errors and codes into clear, non-technical,
 * user-friendly English messages. Never exposes "Firebase:", "auth/...", or raw stack info.
 */
export function formatAuthError(error: any): string {
  if (!error) return "An unexpected error occurred. Please try again.";

  const code = typeof error === 'object' && error.code ? String(error.code).toLowerCase() : '';
  const rawMessage = typeof error === 'string' ? error : error.message || String(error);

  // Phone/Credential already registered with another account
  if (
    code.includes('account-exists-with-different-credential') ||
    code.includes('credential-already-in-use') ||
    code.includes('phone-number-already-exists') ||
    rawMessage.includes('account-exists-with-different-credential') ||
    rawMessage.includes('credential-already-in-use') ||
    rawMessage.includes('phone-number-already-exists')
  ) {
    return "This mobile number is already linked to another account. Please use a different phone number or sign in with the account using this number.";
  }

  if (code.includes('email-already-in-use') || rawMessage.includes('email-already-in-use')) {
    return "An account with this email address already exists. Please sign in instead.";
  }

  if (code.includes('invalid-email') || rawMessage.includes('invalid-email')) {
    return "Please enter a valid email address.";
  }

  if (
    code.includes('wrong-password') ||
    code.includes('invalid-credential') ||
    code.includes('user-not-found') ||
    rawMessage.includes('wrong-password') ||
    rawMessage.includes('invalid-credential') ||
    rawMessage.includes('user-not-found')
  ) {
    return "Incorrect email or password. Please check your details and try again.";
  }

  if (code.includes('weak-password') || rawMessage.includes('weak-password')) {
    return "Password is too weak. Please use at least 6 characters with letters and numbers.";
  }

  if (code.includes('user-disabled') || rawMessage.includes('user-disabled')) {
    return "This account has been disabled. Please contact support.";
  }

  if (code.includes('too-many-requests') || rawMessage.includes('too-many-requests')) {
    return "Too many failed attempts. Please wait a few minutes and try again.";
  }

  if (code.includes('network-request-failed') || rawMessage.includes('network-request-failed')) {
    return "Network error. Please check your internet connection and try again.";
  }

  if (code.includes('invalid-phone-number') || rawMessage.includes('invalid-phone-number')) {
    return "Please enter a valid mobile number with country code.";
  }

  if (code.includes('invalid-verification-code') || rawMessage.includes('invalid-verification-code')) {
    return "The 6-digit SMS verification code is incorrect. Please check the code and try again.";
  }

  if (code.includes('code-expired') || rawMessage.includes('code-expired')) {
    return "The SMS verification code has expired. Please request a new code.";
  }

  if (code.includes('quota-exceeded') || rawMessage.includes('quota-exceeded')) {
    return "SMS limit reached. Please try again later or continue with Email or Google.";
  }

  if (code.includes('popup-closed-by-user') || rawMessage.includes('popup-closed-by-user')) {
    return "Sign-in window was closed before completing authentication.";
  }

  if (
    code.includes('popup-blocked') ||
    code.includes('cancelled-popup-request') ||
    rawMessage.includes('popup-blocked') ||
    rawMessage.includes('cancelled-popup-request')
  ) {
    return "Sign-in popup was blocked by your browser. Please allow popups to continue.";
  }

  if (
    rawMessage.toLowerCase().includes('timed out') ||
    rawMessage.toLowerCase().includes('timeout') ||
    code.includes('timeout')
  ) {
    return "Authentication timed out. Please check your internet connection and try again.";
  }

  if (
    rawMessage.toLowerCase().includes('google sign-in sdk is not included') ||
    rawMessage.toLowerCase().includes('google sign in is not enabled') ||
    rawMessage.toLowerCase().includes('googleservice-info')
  ) {
    return "Google Sign-In is being finalized for iOS. Please sign in with Email or continue with Instant Guest.";
  }

  if (
    rawMessage.toLowerCase().includes('apple') &&
    (rawMessage.toLowerCase().includes('not enabled') || rawMessage.toLowerCase().includes('provider is not enabled'))
  ) {
    return "Apple Sign-In is not enabled yet. Please sign in with Email or continue with Instant Guest.";
  }

  if (code.includes('operation-not-allowed') || rawMessage.includes('operation-not-allowed')) {
    if (rawMessage.toLowerCase().includes('google')) {
      return "Google Sign-In is not enabled yet. Please sign in with Email or continue with Instant Guest.";
    }
    if (rawMessage.toLowerCase().includes('apple')) {
      return "Apple Sign-In is not enabled yet. Please sign in with Email or continue with Instant Guest.";
    }
    return "SMS verification is currently unavailable for this region. You can still save your phone number.";
  }

  if (code.includes('admin-restricted-operation') || rawMessage.includes('admin-restricted-operation')) {
    return "This operation is temporarily restricted. Please try again later.";
  }

  if (code.includes('provider-already-linked') || rawMessage.includes('provider-already-linked')) {
    return "This phone number is already linked to your account.";
  }

  // General fallback: strip any technical backend terms
  const cleanMessage = rawMessage
    .replace(/^Firebase:\s*/i, '')
    .replace(/Error\s*\(auth\/[^)]+\):?\s*/i, '')
    .replace(/\(auth\/[^)]+\)/g, '')
    .replace(/Firebase Console/gi, 'system settings')
    .replace(/Firebase/gi, 'system')
    .replace(/Firestore/gi, 'database')
    .replace(/auth\//gi, '')
    .trim();

  if (!cleanMessage || cleanMessage.includes('/') || cleanMessage.length < 5) {
    return "Authentication failed. Please check your details and try again.";
  }

  return cleanMessage;
}

