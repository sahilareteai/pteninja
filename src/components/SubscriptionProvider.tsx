import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  auth, 
  db, 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  signInAnonymously, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  linkWithCredential,
  signInWithCredential,
  GoogleAuthProvider,
  EmailAuthProvider,
  FirebaseUser,
  googleProvider, 
  handleFirestoreError, 
  OperationType, 
  collection, 
  query, 
  where, 
  getDocs 
} from '../firebase';
import { doc, getDoc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { UserData, SUBSCRIPTION_PLANS } from '../types';
import { CurrencyService, CurrencyInfo } from '../services/currencyService';
import { generateUserReferralCode } from '../services/promoService';
import { isNativeMobile, isIOS, isAndroid, resolveApiUrl } from '../lib/mobile';
import { extractAppleCredentials, isAppleAuthCancellation, createInstantAppleUser } from '../lib/appleAuth';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Zap, Check, CheckCircle, X, ShieldCheck, CreditCard, User, LogOut, Loader2, Mail, Phone, Key, ArrowRight, Sparkles } from 'lucide-react';
import { getLocalDateStr, formatAuthError } from '../lib/utils';
import { Logo } from './Logo';

interface SubscriptionContextType {
  user: UserData | null;
  loading: boolean;
  login: (initialMode?: 'signin' | 'register') => Promise<void>;
  logout: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  isAccessRestricted: boolean;
  showSubscriptionModal: boolean;
  setShowSubscriptionModal: (show: boolean) => void;
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  authError: string | null;
  setAuthError: (error: string | null) => void;
  currency: CurrencyInfo;
  formatPrice: (amount: number) => string;
  pendingGuestWriteRef: React.RefObject<boolean>;
  isSyncingSubscription: boolean;
  setIsSyncingSubscription: (syncing: boolean) => void;
  isEmailVerified: boolean;
  resendEmailVerification: () => Promise<void>;
  checkEmailVerification: () => Promise<boolean>;
  googleLogin: () => Promise<void>;
  appleLogin?: () => Promise<void>;
  quickGuestAccess: () => Promise<void>;
}

const establishNewSession = () => {
  const newSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const now = Date.now();
  try {
    localStorage.setItem('pte_session_id', newSessionId);
    localStorage.setItem('pte_session_created_at', String(now));
  } catch (e) {
    console.warn('[Session] Failed to set localStorage session:', e);
  }
  return { sessionId: newSessionId, sessionCreatedAt: now };
};

const clearLocalSession = () => {
  try {
    localStorage.removeItem('pte_session_id');
    localStorage.removeItem('pte_session_created_at');
  } catch (e) {
    console.warn('[Session] Failed to clear local session:', e);
  }
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestConsent, setGuestConsent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<CurrencyInfo>(CurrencyService.getCurrentCurrency());
  const [isSyncingSubscription, setIsSyncingSubscription] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState<boolean>(true);
  const [verificationResent, setVerificationResent] = useState<boolean>(false);

  const resendEmailVerification = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
      setVerificationResent(true);
    }
  };

  const checkEmailVerification = async (): Promise<boolean> => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setIsEmailVerified(auth.currentUser.emailVerified);
      return auth.currentUser.emailVerified;
    }
    return true;
  };
  // Tracks when a fresh guest write is in-flight so stale Firestore snapshots
  // (from a previous anonymous session) don't trigger the subscription modal.
  const pendingGuestWriteRef = useRef(false);
  // Ensures we only record one visit per browser session.
  const hasRecordedVisitRef = useRef(false);
  // Ensures we only call ensure-admin-role once per auth session.
  const hasEnsuredAdminRoleRef = useRef(false);

  useEffect(() => {
    // Check if returning from Stripe checkout or has referral query param
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get('ref') || params.get('referral');
    if (refParam && refParam.trim()) {
      try {
        localStorage.setItem('pte_pending_referral', refParam.trim().toUpperCase());
      } catch (e) {}
    }

    if (params.has('payment_intent') || params.has('setup_intent')) {
      setIsSyncingSubscription(true);

      // Clear params from URL to avoid re-triggering on refresh
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState(null, '', newUrl);

      // Auto-clear syncing state after 10s if snapshot doesn't arrive
      const timer = setTimeout(() => setIsSyncingSubscription(false), 10000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const initCurrency = async () => {
      await CurrencyService.initialize();
      setCurrency(CurrencyService.getCurrentCurrency());
    };
    initCurrency();
  }, []);

  // Safety fallback: Never keep the user stuck on the loading screen for more than 2.5s on cold boot.
  // If Firebase Auth restoration or Firestore takes longer, release the screen so user sees onboarding/app.
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setLoading(false);
      setIsAuthenticating(false);
    }, 2500);
    return () => clearTimeout(safetyTimer);
  }, []);

  // Safety watchdog: Under NO circumstance allow isAuthenticating to freeze the UI for > 40s
  useEffect(() => {
    if (!isAuthenticating) return;
    const watchdog = setTimeout(() => {
      console.warn('[AuthWatchdog] isAuthenticating remained true for 40s. Auto-releasing lock.');
      setIsAuthenticating(false);
    }, 40000);
    return () => clearTimeout(watchdog);
  }, [isAuthenticating]);

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;
    let snapshotFallbackTimer: NodeJS.Timeout | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up any existing document listener first
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }
      if (snapshotFallbackTimer) {
        clearTimeout(snapshotFallbackTimer);
        snapshotFallbackTimer = null;
      }
      // Reset per-auth-session flags on user change
      hasEnsuredAdminRoleRef.current = false;

      if (firebaseUser) {
        if (firebaseUser.emailVerified) {
          setIsEmailVerified(true);
        } else if (!firebaseUser.isAnonymous) {
          setIsEmailVerified(false);
        }
        setUser(currentUser => {
          if (!currentUser) {
            setLoading(true);
          }
          return currentUser;
        });

        // Failsafe: Never leave user in loading or authenticating state for more than 4s if Firestore snapshot is slow
        snapshotFallbackTimer = setTimeout(() => {
          setLoading(false);
          setIsAuthenticating(false);
        }, 4000);

        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Handle session ID & creation timestamp
        let localSessionId = localStorage.getItem('pte_session_id');
        let localCreatedAt = parseInt(localStorage.getItem('pte_session_created_at') || '0', 10);
        if (!localSessionId) {
          const fresh = establishNewSession();
          localSessionId = fresh.sessionId;
          localCreatedAt = fresh.sessionCreatedAt;
        } else if (!localCreatedAt) {
          localCreatedAt = Date.now();
          try {
            localStorage.setItem('pte_session_created_at', String(localCreatedAt));
          } catch {}
        }

        // Listen for real-time updates to user data
        unsubDoc = onSnapshot(userRef, (docSnap) => {
          // Capture fromCache before type narrowing via exists() turns docSnap
          // into `never` in the else branch (TypeScript type-predicate narrowing).
          const snapFromCache = docSnap.metadata.fromCache;
          if (docSnap.exists()) {
            const userData = docSnap.data() as UserData;
            if (userData.emailVerified) {
              setIsEmailVerified(true);
            }
            
            // Multi-device session enforcement
            // Only enforce for registered accounts (never kick out anonymous guest users)
            if (!firebaseUser.isAnonymous) {
              const currentLocalSessionId = localStorage.getItem('pte_session_id');
              const currentLocalCreatedAt = parseInt(localStorage.getItem('pte_session_created_at') || '0', 10);

              if (userData.currentSessionId && currentLocalSessionId) {
                if (userData.currentSessionId !== currentLocalSessionId) {
                  const remoteCreatedAt = userData.sessionCreatedAt || 0;
                  // Only sign out if another device established a newer session AFTER this device
                  if (remoteCreatedAt > currentLocalCreatedAt) {
                    console.warn('[Session] Superseded by newer session on another device. Signing out.');
                    auth.signOut();
                    clearLocalSession();
                    setSessionError("You have been signed out because your account is being used on another device.");
                    return;
                  } else {
                    // This device is newer or writing its session. Re-assert in Firestore so older device knows.
                    updateDoc(userRef, {
                      currentSessionId: currentLocalSessionId,
                      sessionCreatedAt: currentLocalCreatedAt || Date.now()
                    }).catch(() => {});
                  }
                } else if (!userData.sessionCreatedAt && currentLocalCreatedAt) {
                  // Session IDs match; backfill missing timestamp in legacy Firestore doc
                  updateDoc(userRef, { sessionCreatedAt: currentLocalCreatedAt }).catch(() => {});
                }
              } else if (currentLocalSessionId && !userData.currentSessionId) {
                // Claim session in Firestore if not yet set
                updateDoc(userRef, {
                  currentSessionId: currentLocalSessionId,
                  sessionCreatedAt: currentLocalCreatedAt || Date.now()
                }).catch(() => {});
              }
            }

            // Sync emailVerified if it changed (only for standard registered accounts)
            if (firebaseUser && !firebaseUser.isAnonymous && userData.emailVerified !== firebaseUser.emailVerified) {
              updateDoc(userRef, { emailVerified: firebaseUser.emailVerified }).catch(() => {});
            }

            // Fix trialEndsAt if it was previously stored with an incorrect duration
            // (e.g. 14 days instead of the correct 7-day trial period).
            if (
              userData.subscriptionStatus === 'trial' &&
              userData.trialEndsAt &&
              userData.createdAt
            ) {
              const maxTrialEnd = new Date(
                new Date(userData.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000
              );
              if (new Date(userData.trialEndsAt) > maxTrialEnd) {
                const corrected = maxTrialEnd.toISOString();
                updateDoc(userRef, { trialEndsAt: corrected }).catch(() => {});
                userData.trialEndsAt = corrected;
              }
            }

            if (userData.subscriptionStatus === 'active') {
              setIsSyncingSubscription(false);
            }

            // Auto-assign referral code for existing registered users if missing
            if (!userData.referralCode && !firebaseUser.isAnonymous) {
              const assignedCode = generateUserReferralCode(
                userData.displayName || firebaseUser.displayName,
                firebaseUser.uid
              );
              updateDoc(userRef, {
                referralCode: assignedCode,
                referralCount: userData.referralCount || 0
              }).catch(() => {});
              userData.referralCode = assignedCode;
            }

            if (!userData.signupPlatform && !firebaseUser.isAnonymous) {
              // Existing accounts without a signupPlatform were registered on the Web.
              // Do NOT mark them as 'mobile' just because they log in from a mobile device or app later.
              const originalPlatform = 'web';
              updateDoc(userRef, { signupPlatform: originalPlatform }).catch(() => {});
              userData.signupPlatform = originalPlatform;
            }

            setUser(userData);

            // Ensure admin role for protected accounts (once per auth session)
            if (!firebaseUser.isAnonymous && !hasEnsuredAdminRoleRef.current) {
              hasEnsuredAdminRoleRef.current = true;
              firebaseUser.getIdToken().then(idToken => {
                fetch('/api/ensure-admin-role', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${idToken}` },
                }).catch((err) => console.error('Failed to ensure admin role:', err));
              }).catch((err) => console.error('Failed to get ID token for admin role check:', err));
            }
          } else if (!snapFromCache) {
            // Server has confirmed the document does not exist — safe to create.
            // Skipping fromCache snapshots prevents a stale local-cache entry from
            // triggering a fresh-account write that would overwrite an existing
            // user's activityLog and trialEndsAt (causing a streak + days reset).
            const isGuest = firebaseUser.isAnonymous;
            const now = new Date();
            const createdAt = now.toISOString();
            const pendingRef = !isGuest ? localStorage.getItem('pte_pending_referral') : null;
            const assignedRefCode = !isGuest ? generateUserReferralCode(firebaseUser.displayName, firebaseUser.uid) : undefined;
            const currentPlatform = isNativeMobile() ? 'mobile' : 'web';
            
            const newUser: UserData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email?.toLowerCase() || null,
              emailVerified: firebaseUser.emailVerified,
              displayName: firebaseUser.displayName || null,
              createdAt,
              accessType: isGuest ? 'guest' : 'user',
              subscriptionStatus: isGuest ? 'guest' : 'trial',
              trialEndsAt: isGuest ? undefined : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              referralCode: assignedRefCode,
              referredBy: pendingRef || null,
              referralCount: 0,
              signupPlatform: currentPlatform,
              activityLog: [getLocalDateStr(now)],
              completedTasks: [],
              completedTasksDetailed: [],
              taskScores: {},
              favoriteWords: [],
              schedule: [],
              goals: [],
              currentSessionId: localStorage.getItem('pte_session_id') || undefined,
              sessionCreatedAt: parseInt(localStorage.getItem('pte_session_created_at') || '0', 10) || undefined
            };

            // Remove undefined fields before sending to Firestore
            const firestoreData = { ...newUser };
            Object.keys(firestoreData).forEach(key => {
              if ((firestoreData as any)[key] === undefined) {
                delete (firestoreData as any)[key];
              }
            });

            // Only attempt to create the user document if we are authenticated
            // and don't have a pending auth error.
            // Use merge:true so any manually-set fields (e.g. role:'admin') are
            // preserved even if this snapshot fires before the document is fully loaded.
            setDoc(userRef, firestoreData, { merge: true }).catch(err => {
              const isPermissionError = err.code === 'permission-denied' || 
                                       (err.message && err.message.toLowerCase().includes('insufficient permissions'));
              
              // If it's a permission error and we're anonymous, it might be due to the provider being disabled
              if (firebaseUser.isAnonymous && isPermissionError) {
                console.warn("Could not create guest profile in Firestore. This usually happens if Anonymous Auth is disabled in the console. Error code:", err.code);
              } else {
                handleFirestoreError(err, OperationType.CREATE, `users/${firebaseUser.uid}`);
              }
            });

            // Send a welcome email to any new user with an email address
            if (firebaseUser.email) {
              firebaseUser.getIdToken().then(idToken => {
                return fetch('/api/send-welcome-email', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                  },
                })
                .then(res => {
                  if (!res.ok) {
                    res.json().then(body => {
                      console.warn("Welcome email API error:", body?.error ?? res.status, "for user:", firebaseUser.uid);
                    });
                  }
                });
              }).catch(err => {
                console.warn("Could not send welcome email:", err);
              });
            }

            setUser(newUser);
          }
          // Only finalise loading & record a visit when the snapshot is conclusive
          // (server data, or an existing document from cache). When the cache
          // reports "no document" we wait for the authoritative server snapshot.
          if (docSnap.exists() || !snapFromCache) {
            if (snapshotFallbackTimer) {
              clearTimeout(snapshotFallbackTimer);
              snapshotFallbackTimer = null;
            }
            setLoading(false);
            setIsAuthenticating(false);

            // Record a visit once per browser session
            if (!hasRecordedVisitRef.current) {
              hasRecordedVisitRef.current = true;
              fetch('/api/record-visit', { method: 'POST' }).catch((err) => console.error('Failed to record visit:', err));
            }
          }
        }, (err: any) => {
          if (snapshotFallbackTimer) {
            clearTimeout(snapshotFallbackTimer);
            snapshotFallbackTimer = null;
          }
          // If we're anonymous and get a permission error, it's likely the same root cause
          const isPermissionError = err.code === 'permission-denied' || 
                                   (err.message && err.message.toLowerCase().includes('insufficient permissions'));
          
          if (firebaseUser.isAnonymous && isPermissionError) {
            console.warn("Could not read guest profile from Firestore. Error code:", err.code);
            // We can still set a local guest user so the app doesn't crash
            if (!user) {
              setUser({
                uid: firebaseUser.uid,
                createdAt: new Date().toISOString(),
                accessType: 'guest',
                subscriptionStatus: 'guest',
                favoriteWords: [],
                schedule: [],
                goals: [],
                completedTasksDetailed: []
              });
            }
          } else {
            // Check if we're still the same user. If not, this error is likely from an old listener
            if (auth.currentUser?.uid === firebaseUser.uid) {
              handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
            } else {
              console.warn("Ignoring Firestore error from stale listener for user:", firebaseUser.uid);
            }
          }
          setLoading(false);
          setIsAuthenticating(false);
        });
      } else {
        if (snapshotFallbackTimer) {
          clearTimeout(snapshotFallbackTimer);
          snapshotFallbackTimer = null;
        }
        setUser(null);
        setLoading(false);
        setIsAuthenticating(false);
        setShowAuthModal(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubDoc) unsubDoc();
      if (snapshotFallbackTimer) clearTimeout(snapshotFallbackTimer);
    };
  }, []);

  // Handle redirect sign-in results (when popup was blocked or mobile redirect was used)
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          setShowAuthModal(false);
        }
      })
      .catch((err) => {
        console.error("Redirect sign-in result error:", err);
      });
  }, []);

  const [authTab, setAuthTab] = useState<'email' | 'phone' | 'google'>('email');
  const [emailMode, setEmailMode] = useState<'signin' | 'register' | 'forgot'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [phoneStep, setPhoneStep] = useState<'number' | 'otp'>('number');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const login = async (initialMode: 'signin' | 'register' = 'signin') => {
    setAuthError(null);
    setInfoMessage(null);
    setEmailMode(initialMode);
    setShowAuthModal(true);
  };

  const handleGoogleLogin = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setAuthError(null);
    
    const { sessionId: newSessionId, sessionCreatedAt } = establishNewSession();

    try {
      if (isNativeMobile()) {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        
        // Safety timeout race: Never allow native Google prompt or bridge to freeze indefinitely
        const googleTimeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Google Sign-In timed out. Please try again.')), 15000)
        );

        let res: any;
        try {
          res = await Promise.race([
            FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true } as any),
            googleTimeoutPromise
          ]);
        } catch (cmErr: any) {
          console.warn('[GoogleAuth] Primary attempt failed, trying fallback:', cmErr);
          res = await Promise.race([
            FirebaseAuthentication.signInWithGoogle({ useCredentialManager: false, skipNativeAuth: true } as any),
            googleTimeoutPromise
          ]);
        }

        if (res && res.error) {
          const err = new Error(res.error);
          (err as any).code = res.code;
          throw err;
        }

        let googleIdToken = res?.credential?.idToken;
        if (!googleIdToken) {
          try {
            const idTokenRes = await FirebaseAuthentication.getIdToken();
            googleIdToken = idTokenRes?.token;
          } catch (tokErr) {
            console.warn('[GoogleAuth] getIdToken fallback:', tokErr);
          }
        }

        if (!googleIdToken) {
          throw new Error('Google Sign-In did not return an identity token. Please try again.');
        }

        const credential = GoogleAuthProvider.credential(googleIdToken, res?.credential?.accessToken);
        let signedInUser: any = null;
        if (auth.currentUser && auth.currentUser.isAnonymous) {
          try {
            const linkRes = await linkWithCredential(auth.currentUser, credential);
            signedInUser = linkRes.user;
          } catch (linkErr: any) {
            console.log('[GoogleAuth] Anonymous link deferred or credential in use, signing in directly:', linkErr?.code);
            const signRes = await signInWithCredential(auth, credential);
            signedInUser = signRes.user;
          }
        } else {
          const signRes = await signInWithCredential(auth, credential);
          signedInUser = signRes.user;
        }

        if (signedInUser) {
          updateDoc(doc(db, 'users', signedInUser.uid), {
            currentSessionId: newSessionId,
            sessionCreatedAt
          }).catch(() => {});
        }

        setShowAuthModal(false);
        setIsAuthenticating(false);
        return;
      }

      const popRes = await signInWithPopup(auth, googleProvider);
      if (popRes.user) {
        updateDoc(doc(db, 'users', popRes.user.uid), {
          currentSessionId: newSessionId,
          sessionCreatedAt
        }).catch(() => {});
      }
      setShowAuthModal(false);
      setIsAuthenticating(false);
    } catch (error: any) {
      console.error('[GoogleAuth] Login failure:', error);
      const errMsg = error?.message || String(error || '');
      if (
        errMsg.toLowerCase().includes('cancel') ||
        error?.code === '16' ||
        error?.code === '12501' ||
        error?.code === '-5' ||
        error?.code === '1001'
      ) {
        setIsAuthenticating(false);
        return;
      }
      if (!isNativeMobile() && (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request')) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr: any) {
          console.error("Fallback redirect sign-in error:", redirectErr);
        }
      }
      setIsAuthenticating(false);
      setAuthError(formatAuthError(error));
    } finally {
      setIsAuthenticating(false);
      setShowAuthModal(false);
    }
  };

  const handleAppleLogin = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setAuthError(null);

    const { sessionId: newSessionId, sessionCreatedAt } = establishNewSession();

    try {
      if (isNativeMobile() && isIOS()) {
        // --- iOS NATIVE SIGN IN WITH APPLE (Face ID / Touch ID / Passcode) ---
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

        // Snappy safety timeout: Never allow native Apple sheet or bridge to freeze indefinitely on mobile
        const appleTimeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Apple Sign-In timed out. Please try again.')), 15000)
        );

        const res: any = await Promise.race([
          FirebaseAuthentication.signInWithApple({ skipNativeAuth: true } as any),
          appleTimeoutPromise
        ]);

        if (res && res.error) {
          const err = new Error(res.error);
          (err as any).code = res.code;
          throw err;
        }

        const { idToken, rawNonce, displayName: appleDisplayName } = extractAppleCredentials(res);
        if (!idToken) {
          throw new Error('Unable to obtain identity token from Apple. Please try again.');
        }

        // 1. Decode Apple identity payload from the verified Apple token
        let appleSub = '';
        let appleEmail: string | null = null;
        try {
          const parts = idToken.split('.');
          if (parts.length >= 2) {
            const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const decodedJson = atob(normalized);
            const payload = JSON.parse(decodedJson);
            appleSub = payload.sub || '';
            appleEmail = payload.email ? String(payload.email).trim().toLowerCase() : null;
          }
        } catch (parseErr) {
          console.warn('[AppleAuth iOS] Could not parse Apple token payload:', parseErr);
        }

        // 2. Compute UID and build immediate instant user profile
        const fallbackUid = auth.currentUser?.uid || (appleSub ? `apple_${appleSub.replace(/[^a-zA-Z0-9_-]/g, '_')}` : `apple_${Date.now()}`);
        const initialProfile = {
          uid: fallbackUid,
          email: appleEmail || auth.currentUser?.email || null,
          displayName: appleDisplayName || (appleEmail ? appleEmail.split('@')[0] : 'Ninja Scholar'),
          emailVerified: true
        };

        const instantUser = createInstantAppleUser(initialProfile, newSessionId, appleDisplayName, sessionCreatedAt);

        if (appleSub) {
          try {
            localStorage.setItem('pte_apple_sub', appleSub);
            if (appleEmail) localStorage.setItem('pte_apple_email', appleEmail);
          } catch {}
        }

        // 3. IMMEDIATELY SET USER & UNBLOCK UI!
        // This transitions App.tsx from MobileOnboarding into the Dojo immediately!
        // The spinner stops, the user enters the Dojo with ZERO delay, exactly like guest access!
        setIsEmailVerified(true);
        setUser(instantUser);
        setIsAuthenticating(false);
        setShowAuthModal(false);

        // 4. Background tasks: Firestore sync & Firebase Auth session link
        // Non-blocking firestore profile write
        const userRef = doc(db, 'users', fallbackUid);
        setDoc(userRef, instantUser, { merge: true }).catch((err) => {
          console.warn('[AppleAuth iOS] Background profile write deferred:', err);
        });

        // Background authentication / custom token exchange (non-blocking, 4s timeout)
        (async () => {
          try {
            // Strategy A: Server-side token exchange
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            try {
              const exchangeUrl = resolveApiUrl('/api/apple-session');
              const exchangeRes = await fetch(exchangeUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken, appleDisplayName }),
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (exchangeRes.ok) {
                const data = await exchangeRes.json();
                if (data.customToken) {
                  const { signInWithCustomToken } = await import('firebase/auth');
                  const customCred = await signInWithCustomToken(auth, data.customToken);
                  console.log('[AppleAuth iOS] Background Firebase Custom Token linked:', customCred.user.uid);
                  return;
                }
              }
            } catch (fetchErr) {
              clearTimeout(timeoutId);
            }

            // Strategy B: Client-side signInWithCredential with 4s timeout
            if (rawNonce) {
              const { OAuthProvider } = await import('firebase/auth');
              const provider = new OAuthProvider('apple.com');
              const credential = provider.credential({ idToken, rawNonce });
              const fbTimeout = new Promise<never>((_, reject) => setTimeout(reject, 4000));
              if (auth.currentUser && auth.currentUser.isAnonymous) {
                await Promise.race([linkWithCredential(auth.currentUser, credential), fbTimeout]);
              } else {
                await Promise.race([signInWithCredential(auth, credential), fbTimeout]);
              }
            }
          } catch (bgErr) {
            console.warn('[AppleAuth iOS] Background auth sync deferred:', bgErr);
          }
        })();

        return;
      }

      // --- ANDROID & WEB SIGN IN WITH APPLE (OAuth 2.0 Web Flow) ---
      const { OAuthProvider, linkWithPopup } = await import('firebase/auth');
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');

      if (isNativeMobile() && isAndroid()) {
        try {
          const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
          const appleTimeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Apple Sign-In timed out. Please try again.')), 45000)
          );

          // On Android, skipNativeAuth: false allows the Firebase Android SDK to manage the Chrome Custom Tab OAuth intent
          const res = await Promise.race([
            FirebaseAuthentication.signInWithApple({ skipNativeAuth: false } as any),
            appleTimeoutPromise
          ]);

          const androidUser = res?.user || (auth.currentUser ? {
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            displayName: auth.currentUser.displayName,
          } : null);

          if (androidUser && androidUser.uid) {
            const instantUser = createInstantAppleUser(
              {
                uid: androidUser.uid,
                email: androidUser.email,
                displayName: androidUser.displayName,
                emailVerified: true
              },
              newSessionId,
              androidUser.displayName || undefined,
              sessionCreatedAt
            );
            setUser(instantUser);
            const userRef = doc(db, 'users', androidUser.uid);
            setDoc(userRef, instantUser, { merge: true }).catch((err) => {
              console.warn('[AppleAuth Android] Firestore profile write deferred:', err);
            });

            setIsAuthenticating(false);
            setShowAuthModal(false);
            return;
          }
        } catch (androidPluginErr: any) {
          console.warn('[AppleAuth Android] Native plugin attempt error, attempting browser popup fallback:', androidPluginErr);
          if (isAppleAuthCancellation(androidPluginErr)) {
            setIsAuthenticating(false);
            return;
          }
        }
      }

      // Web popup / redirect flow (and Android fallback)
      let userCred: any;
      if (auth.currentUser && auth.currentUser.isAnonymous) {
        try {
          userCred = await linkWithPopup(auth.currentUser, provider);
        } catch (linkErr: any) {
          console.log('[AppleAuth] Anonymous link deferred:', linkErr?.code);
          userCred = await signInWithPopup(auth, provider);
        }
      } else {
        userCred = await signInWithPopup(auth, provider);
      }

      const firebaseUser = userCred?.user || auth.currentUser;
      if (firebaseUser) {
        const instantUser = createInstantAppleUser(firebaseUser, newSessionId, firebaseUser.displayName || undefined, sessionCreatedAt);
        setUser(instantUser);
        const userRef = doc(db, 'users', firebaseUser.uid);
        setDoc(userRef, instantUser, { merge: true }).catch((err) => {
          console.warn('[AppleAuth] Firestore profile write deferred:', err);
        });
      }

      setIsAuthenticating(false);
      setShowAuthModal(false);
    } catch (error: any) {
      console.error('[AppleAuth] Login failure:', error);
      if (isAppleAuthCancellation(error)) {
        setIsAuthenticating(false);
        return;
      }
      setIsAuthenticating(false);
      setAuthError(formatAuthError(error));
    } finally {
      setIsAuthenticating(false);
      setShowAuthModal(false);
    }
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setInfoMessage(null);

    if (emailMode === 'forgot') {
      if (!authEmail.trim()) return setAuthError("Please enter your email address.");
      try {
        await sendPasswordResetEmail(auth, authEmail.trim());
        setInfoMessage("Password reset email sent! Check your inbox.");
      } catch (err: any) {
        setAuthError(formatAuthError(err));
      }
      return;
    }

    if (emailMode === 'signin') {
      if (!authEmail.trim() || !authPassword) return setAuthError("Please enter email and password.");
      setIsAuthenticating(true);
      const { sessionId: newSessionId, sessionCreatedAt } = establishNewSession();
      try {
        const signinRes = await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
        if (signinRes.user) {
          updateDoc(doc(db, 'users', signinRes.user.uid), {
            currentSessionId: newSessionId,
            sessionCreatedAt
          }).catch(() => {});
        }
        setShowAuthModal(false);
      } catch (err: any) {
        setIsAuthenticating(false);
        setAuthError(formatAuthError(err));
      }
      return;
    }

    if (emailMode === 'register') {
      if (!authName.trim() || !authEmail.trim() || !authPassword) {
        return setAuthError("Please fill out all required fields.");
      }
      if (authPassword.length < 6) {
        return setAuthError("Password must be at least 6 characters.");
      }
      setIsAuthenticating(true);
      const { sessionId: newSessionId, sessionCreatedAt } = establishNewSession();
      try {
        let firebaseUser: FirebaseUser;

        // If phone was already verified via SMS OTP in this session, link email/pass to that user
        if (auth.currentUser && isPhoneVerified) {
          try {
            const emailCred = EmailAuthProvider.credential(authEmail.trim(), authPassword);
            const linkResult = await linkWithCredential(auth.currentUser, emailCred);
            firebaseUser = linkResult.user;
          } catch (linkErr: any) {
            if (linkErr.code === 'auth/credential-already-in-use' || linkErr.code === 'auth/email-already-in-use') {
              setIsAuthenticating(false);
              return setAuthError("An account with this email address already exists. Please sign in instead.");
            }
            const cred = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
            firebaseUser = cred.user;
          }
        } else {
          const cred = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
          firebaseUser = cred.user;
        }
        
        await updateProfile(firebaseUser, { displayName: authName.trim() });

        try {
          await sendEmailVerification(firebaseUser);
        } catch (verr) {
          console.warn("Failed to send email verification:", verr);
        }
        setIsEmailVerified(false);

        const userRef = doc(db, 'users', firebaseUser.uid);
        const now = new Date();
        const trialEnds = new Date();
        trialEnds.setDate(trialEnds.getDate() + 7);
        const pendingRef = localStorage.getItem('pte_pending_referral');
        const assignedRefCode = generateUserReferralCode(authName.trim(), firebaseUser.uid);

        const newUser: UserData = {
          uid: firebaseUser.uid,
          email: authEmail.trim().toLowerCase(),
          phoneNumber: authPhone.trim() || null,
          phoneVerified: isPhoneVerified,
          displayName: authName.trim(),
          createdAt: now.toISOString(),
          accessType: 'user',
          subscriptionStatus: 'trial',
          trialEndsAt: trialEnds.toISOString(),
          referralCode: assignedRefCode,
          referredBy: pendingRef || null,
          referralCount: 0,
          signupPlatform: isNativeMobile() ? 'mobile' : 'web',
          activityLog: [getLocalDateStr(now)],
          completedTasks: [],
          completedTasksDetailed: [],
          taskScores: {},
          favoriteWords: [],
          schedule: [],
          goals: [],
          currentSessionId: newSessionId,
          sessionCreatedAt
        };

        await setDoc(userRef, newUser, { merge: true });

        firebaseUser.getIdToken().then(idToken => {
          fetch('/api/send-welcome-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
          }).catch(err => console.warn("Failed to trigger welcome email:", err));
        });

        setShowAuthModal(false);
      } catch (err: any) {
        if (err.code === 'auth/email-already-in-use') {
          try {
            const signinCred = await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
            if (signinCred.user && !signinCred.user.emailVerified) {
              await sendEmailVerification(signinCred.user);
              setIsEmailVerified(false);
              setShowAuthModal(false);
              setIsAuthenticating(false);
              return;
            }
          } catch (signinErr) {
            // Password didn't match
          }
        }
        setIsAuthenticating(false);
        setAuthError(formatAuthError(err));
      }
    }
  };

  const handleSendPhoneOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!authPhone.trim()) return setAuthError("Please enter a valid phone number with country code.");

    // Require Name, Email, and Password before starting phone verification in registration
    if (emailMode === 'register') {
      if (!authName.trim()) {
        return setAuthError("Please enter your Name before verifying your phone number.");
      }
      if (!authEmail.trim()) {
        return setAuthError("Please enter your Email address before verifying your phone number.");
      }
      if (authPassword.length < 6) {
        return setAuthError("Please enter your Password (min 6 characters) before verifying your phone number.");
      }
    }

    setIsAuthenticating(true);
    try {
      const recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible'
      });
      const result = await signInWithPhoneNumber(auth, authPhone.trim(), recaptchaVerifier);
      setConfirmationResult(result);
      setPhoneStep('otp');
      setIsAuthenticating(false);
      setInfoMessage("Verification code sent to your phone!");
    } catch (err: any) {
      setIsAuthenticating(false);
      setAuthError(formatAuthError(err));
    }
  };

  const [isPhoneVerified, setIsPhoneVerified] = useState(false);

  const handleVerifyPhoneOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!otpCode.trim() || !confirmationResult) return setAuthError("Please enter the 6-digit code.");

    setIsAuthenticating(true);
    try {
      await confirmationResult.confirm(otpCode.trim());
      setIsPhoneVerified(true);
      setPhoneStep('number');
      setIsAuthenticating(false);
      setShowAuthModal(true); // Keep registration modal active
      setInfoMessage("Phone number verified! Now click 'Create Account' below to complete your registration.");
    } catch (err: any) {
      setIsAuthenticating(false);
      setAuthError(formatAuthError(err));
    }
  };

  const logout = async () => {
    try {
      clearLocalSession();
      setUser(null);
      setShowAuthModal(false);

      if (auth.currentUser) {
        try {
          await auth.signOut();
        } catch (authErr) {
          console.warn('Firebase signOut warning:', authErr);
        }
      }
    } catch (error) {
      console.error("Logout failed:", error);
      setUser(null);
      setAuthError("Failed to sign out. Please try again.");
    }
  };

  const continueAsGuest = async () => {
    setShowGuestModal(true);
  };

  const handleQuickGuestAccess = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const newSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('pte_session_id', newSessionId);
      pendingGuestWriteRef.current = true;

      // Safety timeout race: Never allow signInAnonymously to freeze on mobile (WKWebView)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Guest access timeout. Connecting locally...')), 7500)
      );

      const cred: any = await Promise.race([signInAnonymously(auth), timeoutPromise]);
      const firebaseUser = cred.user;
      const userRef = doc(db, 'users', firebaseUser.uid);
      const now = new Date();
      const newUser: UserData = {
        uid: firebaseUser.uid,
        email: null,
        displayName: 'Guest Ninja',
        createdAt: now.toISOString(),
        accessType: 'guest',
        subscriptionStatus: 'guest',
        signupPlatform: isNativeMobile() ? 'mobile' : 'web',
        activityLog: [getLocalDateStr(now)],
        completedTasks: [],
        completedTasksDetailed: [],
        taskScores: {},
        favoriteWords: [],
        schedule: [],
        goals: [],
        currentSessionId: newSessionId
      };

      // Non-blocking firestore sync
      try {
        await Promise.race([
          setDoc(userRef, newUser, { merge: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore write timeout')), 3500))
        ]);
      } catch (writeErr) {
        console.warn('Firestore guest profile write deferred:', writeErr);
      }

      pendingGuestWriteRef.current = false;
      setUser(newUser);
      setShowAuthModal(false);
      setIsAuthenticating(false);
    } catch (err: any) {
      pendingGuestWriteRef.current = false;
      console.warn("Quick guest login fallback triggered:", err);

      // Instant local fallback: guarantee user can explore the app without getting stuck
      try {
        const localUid = 'guest_' + Math.random().toString(36).substring(2, 10);
        const now = new Date();
        const fallbackUser: UserData = {
          uid: localUid,
          email: null,
          displayName: 'Guest Ninja',
          createdAt: now.toISOString(),
          accessType: 'guest',
          subscriptionStatus: 'guest',
          signupPlatform: isNativeMobile() ? 'mobile' : 'web',
          activityLog: [getLocalDateStr(now)],
          completedTasks: [],
          completedTasksDetailed: [],
          taskScores: {},
          favoriteWords: [],
          schedule: [],
          goals: [],
          currentSessionId: localStorage.getItem('pte_session_id') || 'guest_session'
        };
        setUser(fallbackUser);
        setShowAuthModal(false);
      } catch (fallbackErr) {
        setShowGuestModal(true);
      } finally {
        setIsAuthenticating(false);
      }
    }
  };

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || !guestEmail.trim()) {
      setAuthError("Name and Email address are required to continue.");
      return;
    }
    if (!guestConsent) {
      setAuthError("You must agree to the Privacy Policy to continue.");
      return;
    }

    if (isAuthenticating) return;
    
    // Close modal immediately for a snappier feel
    setShowGuestModal(false);
    setIsAuthenticating(true);
    setAuthError(null);
    setSessionError(null);
    try {
      // Validation: Check if a user with this email already exists via server-side API
      // (Direct Firestore query would fail due to security rules)
      const cleanEmail = guestEmail.trim().toLowerCase();
      if (cleanEmail) {
        const response = await fetch('/api/check-email-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail })
        });

        if (response.ok) {
          const data = await response.json();
          if (!data.available) {
            if (data.accessType === 'user') {
              setAuthError("This email is already registered with a Premium/Trial account. Please use 'Login with Google' instead.");
            } else {
              setAuthError("A guest session is already active for this email. Please use a different email or sign in with Google.");
            }
            setIsAuthenticating(false);
            setShowGuestModal(true);
            return;
          }
        }
      }

      const newSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('pte_session_id', newSessionId);
      
      // Block stale Firestore snapshots from showing the payment modal while we
      // write the fresh guest document. The ref is synchronous so it is set
      // before signInAnonymously triggers onAuthStateChanged / onSnapshot.
      pendingGuestWriteRef.current = true;
      const cred = await signInAnonymously(auth);
      const firebaseUser = cred.user;
      
      // Update the user document immediately with the name and email
      const userRef = doc(db, 'users', firebaseUser.uid);
      const now = new Date();
      const createdAt = now.toISOString();
      
      const newUser: UserData = {
        uid: firebaseUser.uid,
        email: cleanEmail || null,
        phoneNumber: guestPhone.trim() || null,
        displayName: guestName.trim(),
        createdAt,
        accessType: 'guest',
        subscriptionStatus: 'guest',
        signupPlatform: isNativeMobile() ? 'mobile' : 'web',
        activityLog: [getLocalDateStr(now)],
        completedTasks: [],
        completedTasksDetailed: [],
        taskScores: {},
        favoriteWords: [],
        schedule: [],
        goals: [],
        currentSessionId: newSessionId
      };

      await setDoc(userRef, newUser);

      // Trigger welcome email for guests who provided an email
      if (newUser.email) {
        firebaseUser.getIdToken().then(idToken => {
          fetch('/api/send-welcome-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
          }).catch(err => console.warn("Failed to trigger guest welcome email:", err));
        });
      }

      // Fresh data is written – clear the guard before updating React state so
      // the access check runs against the correct, unexpired guest record.
      pendingGuestWriteRef.current = false;
      setUser(newUser);
      
      setShowAuthModal(false);
      setIsAuthenticating(false);
    } catch (error: any) {
      pendingGuestWriteRef.current = false;
      console.error("Guest login failed:", error);
      setIsAuthenticating(false);
      setShowGuestModal(true); // Re-open modal if it fails so user can see error
      
      const isPermissionError = error.code === 'permission-denied' ||
                               (error.message && error.message.toLowerCase().includes('insufficient permissions'));

      if (error.code === 'auth/admin-restricted-operation') {
        setAuthError("Guest access is temporarily unavailable. Please sign in or register with Email or Google.");
      } else if (isPermissionError) {
        setAuthError("Permission denied. This email might be reserved or your session expired. Please try with Google login.");
      } else {
        setAuthError("Failed to sign in as guest. Please try again later.");
      }
    }
  };

  const checkAccess = () => {
    if (!user) return false;
    
    const now = new Date();
    
    if (user.subscriptionStatus === 'active') {
      if (user.subscriptionEndsAt && new Date(user.subscriptionEndsAt) < now) {
        return false;
      }
      return true;
    }
    
    if (user.subscriptionStatus === 'trial') {
      if (user.trialEndsAt && new Date(user.trialEndsAt) < now) {
        return false;
      }
      return true;
    }
    
    if (user.subscriptionStatus === 'guest') {
      const createdAt = new Date(user.createdAt);
      const guestExpiresAt = new Date(createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);
      if (guestExpiresAt < now) {
        return false;
      }
      return true;
    }
    
    return false;
  };

  const isAccessRestricted = !!user && !loading && !checkAccess();
  
  useEffect(() => {
    if (user && !isAccessRestricted) {
      setShowSubscriptionModal(false);
    }
  }, [user, isAccessRestricted]);
  
  useEffect(() => {
    if (user && user.uid) {
      const today = getLocalDateStr();
      const activityLog = user.activityLog || [];
      
      if (!activityLog.includes(today)) {
        const newLog = [...activityLog, today].sort();
        const userRef = doc(db, 'users', user.uid);
        updateDoc(userRef, { activityLog: newLog }).catch(err => {
          handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
        });
      }
    }
  }, [user?.uid, user?.activityLog?.length]);

  useEffect(() => {
    if (isAccessRestricted && !loading && !pendingGuestWriteRef.current) {
      setShowSubscriptionModal(true);
    }
  }, [isAccessRestricted, loading]);

  return (
    <SubscriptionContext.Provider value={{ 
      user, 
      loading, 
      login, 
      logout, 
      continueAsGuest, 
      isAccessRestricted,
      showSubscriptionModal,
      setShowSubscriptionModal,
      showAuthModal,
      setShowAuthModal,
      authError,
      setAuthError,
      currency,
      formatPrice: (amount: number) => CurrencyService.format(CurrencyService.convert(amount)),
      pendingGuestWriteRef,
      isSyncingSubscription,
      setIsSyncingSubscription,
      isEmailVerified,
      resendEmailVerification,
      checkEmailVerification,
      googleLogin: handleGoogleLogin,
      appleLogin: handleAppleLogin,
      quickGuestAccess: handleQuickGuestAccess
    }}>
      {children}

      {/* Email Verification Required Overlay */}
      <AnimatePresence>
        {user && !isEmailVerified && user.accessType !== 'guest' && !!(user.email || auth.currentUser?.email) && !showAuthModal && (
          <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-gray-800 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-700 text-center relative overflow-hidden my-8"
            >
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>

              <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
                Verify Your Email Address
              </h3>
              
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                We sent a verification link to <span className="font-bold text-gray-900 dark:text-white">{user.email || auth.currentUser?.email}</span>. Please click the link in your inbox to verify ownership and unlock full access to PTE Ninja.
              </p>

              {verificationResent && (
                <p className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-100 dark:border-green-900/30 mb-4 font-medium">
                  Verification email resent! Please check your inbox and spam folder.
                </p>
              )}

              {authError && (
                <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-100 dark:border-red-900/30 mb-4 font-medium">
                  {authError}
                </p>
              )}

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={async () => {
                    setAuthError(null);
                    const verified = await checkEmailVerification();
                    if (!verified) {
                      setAuthError("Email not verified yet. Please click the verification link in your email and try again.");
                    }
                  }}
                  className="w-full py-3.5 bg-app-primary text-white rounded-xl font-bold hover:bg-app-accent transition-all shadow-lg shadow-app-primary/20 flex items-center justify-center gap-2 text-sm"
                >
                  <Check size={18} />
                  I've Verified My Email
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    setAuthError(null);
                    try {
                      await resendEmailVerification();
                    } catch (err: any) {
                      setAuthError(formatAuthError(err));
                    }
                  }}
                  className="w-full py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all text-xs"
                >
                  Resend Verification Link
                </button>

                <button
                  type="button"
                  onClick={logout}
                  className="w-full py-2.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white font-semibold transition-colors"
                >
                  Sign Out / Use Different Email
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Auth Loading Overlay */}
      <AnimatePresence>
        {(isAuthenticating || isSyncingSubscription) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-app-bg/95 backdrop-blur-xl flex flex-col items-center justify-center text-center p-6"
          >
            <motion.div
              animate={{ 
                y: [0, -10, 0],
                scale: [1, 1.05, 1]
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="mb-8"
            >
              <Logo size={100} />
            </motion.div>
            
            <div className="space-y-6">
              <div className="flex items-center justify-center gap-2">
                <div className="w-2.5 h-2.5 bg-app-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2.5 h-2.5 bg-app-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2.5 h-2.5 bg-app-primary rounded-full animate-bounce" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-app-text tracking-tight uppercase">
                  {isSyncingSubscription ? "Activating Premium" : (guestName ? "Preparing Your Dojo" : "Authenticating")}
                </h3>
                <p className="text-app-text-muted text-sm max-w-[280px] mx-auto leading-relaxed">
                  {isSyncingSubscription
                    ? "Securing your subscription and unlocking all premium features..."
                    : (guestName
                      ? "Sharpening your katanas and setting up your practice environment..."
                      : "Connecting to the Ninja network...")}
                </p>
              </div>

              {/* Instant dismiss/cancel button so user is NEVER stuck */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.5 }}
                type="button"
                onClick={() => {
                  setIsAuthenticating(false);
                  setIsSyncingSubscription(false);
                  setShowAuthModal(false);
                }}
                className="mt-2 px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white/70 hover:text-white transition-all cursor-pointer border border-white/10"
              >
                Cancel
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session Error Modal */}
      <AnimatePresence>
        {sessionError && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-red-100 dark:border-red-900/30 text-center"
            >
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <LogOut className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Session Expired</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                {sessionError}
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { setSessionError(null); login(); }}
                  className="w-full py-3 px-6 bg-app-primary text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
                >
                  Sign In Again
                </button>
                <button
                  onClick={() => setSessionError(null)}
                  className="w-full py-3 px-6 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-semibold hover:opacity-90 transition-opacity"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Unified Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <div id="recaptcha-container"></div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-gray-800 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden relative my-8"
            >
              <button 
                onClick={() => setShowAuthModal(false)}
                className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors z-10"
              >
                <X size={20} className="text-gray-500" />
              </button>

              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-app-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Logo size={40} />
                </div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                  {emailMode === 'register' ? 'Create your Account' : emailMode === 'forgot' ? 'Reset Password' : 'Sign in to PTE Ninja'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {emailMode === 'register' ? 'Get started with AI-powered PTE practice' : 'Welcome back! Please enter your details'}
                </p>
              </div>

              <div className="space-y-4">
                <form onSubmit={handleEmailAuthSubmit} className="space-y-4">
                  {emailMode === 'register' && (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 ml-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={authName}
                        onChange={(e) => setAuthName(e.target.value)}
                        placeholder="e.g. Sahil Gupta"
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-app-primary outline-none text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 ml-1">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-app-primary outline-none text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  {emailMode !== 'forgot' && (
                    <div>
                      <div className="flex justify-between items-center mb-1 ml-1">
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                          Password <span className="text-red-500">*</span>
                        </label>
                        {emailMode === 'signin' && (
                          <button
                            type="button"
                            onClick={() => { setEmailMode('forgot'); setAuthError(null); setInfoMessage(null); }}
                            className="text-[11px] text-app-primary hover:underline font-semibold"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <input
                        type="password"
                        required
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-app-primary outline-none text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  )}

                  {emailMode === 'register' && (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 ml-1">
                        Phone Number <span className="text-gray-400 font-normal">(Optional)</span>
                      </label>
                      {isPhoneVerified ? (
                        <div className="flex gap-2 items-center">
                          <input
                            type="tel"
                            value={authPhone}
                            readOnly
                            className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800/80 border border-green-500/30 rounded-xl text-gray-900 dark:text-white text-sm"
                          />
                          <div className="px-3 py-2.5 bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap">
                            <CheckCircle size={14} className="text-green-500" />
                            <span>Verified</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setIsPhoneVerified(false);
                              setPhoneStep('number');
                            }}
                            className="text-xs text-app-primary hover:underline px-2 py-1 font-semibold"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="tel"
                            value={authPhone}
                            onChange={(e) => {
                              setAuthPhone(e.target.value);
                              if (isPhoneVerified) setIsPhoneVerified(false);
                              if (phoneStep === 'otp') setPhoneStep('number');
                            }}
                            placeholder="Please add your phone number here"
                            className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-app-primary outline-none text-gray-900 dark:text-white text-sm"
                          />
                          {authPhone.trim().length > 6 && phoneStep === 'number' && (
                            <button
                              type="button"
                              onClick={handleSendPhoneOTP}
                              className="px-3 py-2 bg-app-primary/10 text-app-primary hover:bg-app-primary hover:text-white text-xs font-bold rounded-xl transition-all whitespace-nowrap border border-app-primary/20"
                            >
                              Verify SMS
                            </button>
                          )}
                        </div>
                      )}
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 ml-1">
                        Optional. SMS verification is not required to create your account.
                      </p>

                      {phoneStep === 'otp' && (
                        <div className="mt-3 p-3 bg-app-primary/5 rounded-xl border border-app-primary/20 space-y-2">
                          <label className="block text-xs font-bold text-app-primary">
                            Enter 6-Digit SMS Verification Code
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              maxLength={6}
                              value={otpCode}
                              onChange={(e) => setOtpCode(e.target.value)}
                              placeholder="123456"
                              className="flex-1 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-center tracking-widest font-mono text-sm font-bold text-gray-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={handleVerifyPhoneOTP}
                              disabled={otpCode.length < 6}
                              className="px-4 py-2 bg-app-primary text-white font-bold text-xs rounded-lg disabled:opacity-50"
                            >
                              Verify
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {authError && (
                    <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-100 dark:border-red-900/30">
                      {authError}
                    </p>
                  )}

                  {infoMessage && (
                    <p className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-100 dark:border-green-900/30">
                      {infoMessage}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isAuthenticating}
                    className="w-full py-3.5 bg-app-primary text-white rounded-xl font-bold hover:bg-app-accent transition-all shadow-lg shadow-app-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isAuthenticating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      emailMode === 'signin' ? "Sign In with Email" : emailMode === 'register' ? "Create Account" : "Send Reset Email"
                    )}
                  </button>
                </form>
              </div>

              {/* Google Sign-In Placed Nicely Below */}
              <div className="relative my-5 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                </div>
                <span className="relative px-3 bg-white dark:bg-gray-800 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Or continue with
                </span>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isAuthenticating}
                className="w-full py-3 px-4 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-all shadow-sm flex items-center justify-center gap-3 text-sm"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Continue with Google
              </button>

              {/* Modal Footer: Sign In vs Sign Up prompt */}
              <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700/60 text-center text-xs text-gray-600 dark:text-gray-400 font-medium">
                {emailMode === 'signin' ? (
                  <>
                    Don't have an account yet?{' '}
                    <button
                      type="button"
                      onClick={() => { setEmailMode('register'); setAuthError(null); setInfoMessage(null); }}
                      className="text-app-primary font-bold hover:underline ml-0.5"
                    >
                      Sign up for free
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setEmailMode('signin'); setAuthError(null); setInfoMessage(null); }}
                      className="text-app-primary font-bold hover:underline ml-0.5"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Guest Info Modal */}
      <AnimatePresence>
        {showGuestModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-gray-800 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden relative"
            >
              <button 
                onClick={() => setShowGuestModal(false)}
                className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>

              <div className="w-16 h-16 bg-app-primary/10 rounded-2xl flex items-center justify-center mb-6">
                <User className="w-8 h-8 text-app-primary" />
              </div>

              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome, Guest!</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                Please enter your name to start your free PTE practice session.
              </p>

              <form onSubmit={handleGuestSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                    Your Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-app-primary outline-none transition-all text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-app-primary outline-none transition-all text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                    Phone Number <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="Please add your phone number here"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-app-primary outline-none transition-all text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                </div>

                <div className="flex items-start gap-3 mt-4 px-1">
                  <input
                    type="checkbox"
                    id="guestConsent"
                    checked={guestConsent}
                    onChange={(e) => setGuestConsent(e.target.checked)}
                    className="mt-1 w-4 h-4 text-app-primary border-gray-300 rounded focus:ring-app-primary dark:border-gray-600 dark:bg-gray-800"
                    required
                  />
                  <label htmlFor="guestConsent" className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    I agree to the <a href="#" onClick={(e) => { e.preventDefault(); document.getElementById('privacy-policy')?.scrollIntoView(); setShowGuestModal(false); }} className="text-app-primary hover:underline">Privacy Policy</a> and <a href="#" onClick={(e) => { e.preventDefault(); document.getElementById('terms-of-service')?.scrollIntoView(); setShowGuestModal(false); }} className="text-app-primary hover:underline">Terms of Service</a>.
                  </label>
                </div>

                {authError && (
                  <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-100 dark:border-red-900/30">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isAuthenticating || !guestName.trim() || !guestEmail.trim()}
                  className="w-full py-4 bg-app-primary text-white rounded-xl font-bold hover:bg-app-accent transition-all shadow-lg shadow-app-primary/20 disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
                >
                  {isAuthenticating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Starting...
                    </>
                  ) : (
                    "Start Practice Now"
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
