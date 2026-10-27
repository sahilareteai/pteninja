import { UserData } from '../types';
import { getLocalDateStr } from './utils';

export interface ExtractedAppleCredentials {
  idToken?: string;
  rawNonce?: string;
  authorizationCode?: string;
  displayName?: string;
  user?: any;
}

/**
 * Extracts Apple identity token, nonce, and authorization code from any structure
 * returned by @capacitor-firebase/authentication or native iOS plugins.
 */
export function extractAppleCredentials(res: any): ExtractedAppleCredentials {
  if (!res) {
    throw new Error('No authentication response received from Apple.');
  }

  // 1. Extract displayName if available (Apple only provides this on the first sign-in)
  let displayName: string | undefined = undefined;
  if (res.user?.displayName) {
    displayName = res.user.displayName;
  } else if (res.credential?.displayName) {
    displayName = res.credential.displayName;
  } else if (res.displayName) {
    displayName = res.displayName;
  }

  // 2. Extract idToken from credential or root level
  const idToken =
    res.credential?.idToken ||
    res.idToken ||
    res.credential?.token ||
    res.token ||
    (typeof res.credential === 'string' ? res.credential : undefined);

  if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
    // If res contains an already authenticated user object (e.g. from Android native OAuth or web redirect)
    if (res.user && typeof res.user === 'object' && (res.user.uid || res.user.email)) {
      return {
        idToken: undefined,
        rawNonce: undefined,
        authorizationCode: undefined,
        displayName: typeof displayName === 'string' && displayName.trim().length > 0 ? displayName.trim() : undefined,
        user: res.user,
      };
    }
    throw new Error('Unable to obtain identity token from Apple. Please try again.');
  }

  // 3. Extract rawNonce from credential or root level
  const rawNonce =
    res.credential?.nonce ||
    res.nonce ||
    res.credential?.rawNonce ||
    res.rawNonce ||
    undefined;

  // 4. Extract authorizationCode if available
  const authorizationCode =
    res.credential?.authorizationCode ||
    res.authorizationCode ||
    undefined;

  return {
    idToken: idToken.trim(),
    rawNonce: typeof rawNonce === 'string' ? rawNonce.trim() : undefined,
    authorizationCode: typeof authorizationCode === 'string' ? authorizationCode.trim() : undefined,
    displayName: typeof displayName === 'string' && displayName.trim().length > 0 ? displayName.trim() : undefined,
    user: res.user || undefined,
  };
}

/**
 * Determines whether an error was caused by the user cancelling the Apple Sign-In sheet.
 * If cancelled, we should not display a failure banner.
 */
export function isAppleAuthCancellation(error: any): boolean {
  if (!error) return false;

  const code = String(error.code || error.errorCode || '').toLowerCase();
  const message = String(error.message || error || '').toLowerCase();

  return (
    code === '1001' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/popup-closed-by-user' ||
    message.includes('1001') ||
    message.includes('cancel') ||
    message.includes('canceled') ||
    message.includes('cancelled') ||
    message.includes('popup-closed-by-user') ||
    message.includes('user cancelled') ||
    message.includes('user canceled')
  );
}

/**
 * Instantly constructs a standard UserData profile for a user signing in with Apple.
 * Setting this in state immediately unblocks the app UI and opens the Dojo without
 * having to wait for slow or pending network Firestore snapshot roundtrips.
 */
export function createInstantAppleUser(
  firebaseUser: { uid: string; email?: string | null; displayName?: string | null; emailVerified?: boolean },
  currentSessionId: string,
  appleDisplayName?: string
): UserData {
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const resolvedDisplayName =
    appleDisplayName ||
    firebaseUser.displayName ||
    (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Ninja Scholar');

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ? firebaseUser.email.toLowerCase() : null,
    emailVerified: firebaseUser.emailVerified ?? true,
    displayName: resolvedDisplayName,
    createdAt: now.toISOString(),
    accessType: 'user',
    subscriptionStatus: 'trial',
    trialEndsAt: trialEnd.toISOString(),
    referralCount: 0,
    signupPlatform: 'mobile',
    activityLog: [getLocalDateStr(now)],
    completedTasks: [],
    completedTasksDetailed: [],
    taskScores: {},
    favoriteWords: [],
    schedule: [],
    goals: [],
    currentSessionId: currentSessionId || undefined,
  };
}
