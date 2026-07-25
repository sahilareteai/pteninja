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
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Zap, Check, X, ShieldCheck, CreditCard, User, LogOut, Loader2, Mail, Phone, Key, ArrowRight, Sparkles } from 'lucide-react';
import { getLocalDateStr } from '../lib/utils';
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
}

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
    // Check if returning from Stripe checkout
    const params = new URLSearchParams(window.location.search);
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

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up any existing document listener first
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }
      // Reset per-auth-session flags on user change
      hasEnsuredAdminRoleRef.current = false;

      if (firebaseUser) {
        setIsEmailVerified(firebaseUser.emailVerified);
        setLoading(true);
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Handle session ID
        let localSessionId = localStorage.getItem('pte_session_id');
        if (!localSessionId) {
          localSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          localStorage.setItem('pte_session_id', localSessionId);
        }

        // Always claim this device's session in Firestore.
        // This fixes a race condition where login() pre-sets a new session ID in
        // localStorage but onAuthStateChanged previously skipped the Firestore write
        // (because a local ID already existed), causing an immediate false mismatch.
        let sessionClaimed = false;
        updateDoc(userRef, { currentSessionId: localSessionId })
          .then(() => { sessionClaimed = true; })
          .catch(() => {
            // Doc doesn't exist yet – it will be created in the snapshot handler's
            // else block. sessionClaimed will be set to true once the snapshot
            // confirms our session ID is reflected in Firestore.
          });

        // Listen for real-time updates to user data
        unsubDoc = onSnapshot(userRef, (docSnap) => {
          // Capture fromCache before type narrowing via exists() turns docSnap
          // into `never` in the else branch (TypeScript type-predicate narrowing).
          const snapFromCache = docSnap.metadata.fromCache;
          if (docSnap.exists()) {
            const userData = docSnap.data() as UserData;
            
            // Session check – only enforce after our session is established in
            // Firestore to prevent false "session expired" errors during sign-in.
            const currentLocalSessionId = localStorage.getItem('pte_session_id');
            // Confirm session is claimed once Firestore reflects our session ID.
            if (userData.currentSessionId === currentLocalSessionId) {
              sessionClaimed = true;
            }
            if (sessionClaimed && userData.currentSessionId && currentLocalSessionId && userData.currentSessionId !== currentLocalSessionId) {
              // Another device logged in after we established our session
              auth.signOut();
              localStorage.removeItem('pte_session_id');
              setSessionError("You have been signed out because your account is being used on another device.");
              return;
            }

            // Sync emailVerified if it changed
            if (firebaseUser && userData.emailVerified !== firebaseUser.emailVerified) {
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
            
            const newUser: UserData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email?.toLowerCase() || null,
              emailVerified: firebaseUser.emailVerified,
              displayName: firebaseUser.displayName || null,
              createdAt,
              accessType: isGuest ? 'guest' : 'user',
              subscriptionStatus: isGuest ? 'guest' : 'trial',
              trialEndsAt: isGuest ? undefined : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              activityLog: [getLocalDateStr(now)],
              completedTasks: [],
              completedTasksDetailed: [],
              taskScores: {},
              favoriteWords: [],
              schedule: [],
              goals: [],
              currentSessionId: localStorage.getItem('pte_session_id') || undefined
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
            setLoading(false);
            setIsAuthenticating(false);

            // Record a visit once per browser session
            if (!hasRecordedVisitRef.current) {
              hasRecordedVisitRef.current = true;
              fetch('/api/record-visit', { method: 'POST' }).catch((err) => console.error('Failed to record visit:', err));
            }
          }
        }, (err: any) => {
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
        setUser(null);
        setLoading(false);
        setIsAuthenticating(false);
        setShowAuthModal(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubDoc) unsubDoc();
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

const formatAuthError = (error: any): string => {
  if (!error) return "An unexpected error occurred. Please try again.";
  
  const code = typeof error === 'object' && error.code ? error.code : '';
  const rawMessage = typeof error === 'string' ? error : error.message || String(error);

  switch (code) {
    case 'auth/email-already-in-use':
      return "An account with this email address already exists. Please sign in instead.";
    case 'auth/invalid-email':
      return "Please enter a valid email address.";
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
      return "Incorrect email or password. Please check your details and try again.";
    case 'auth/weak-password':
      return "Password is too weak. Please use at least 6 characters with letters and numbers.";
    case 'auth/user-disabled':
      return "This account has been disabled. Please contact support.";
    case 'auth/too-many-requests':
      return "Too many failed sign-in attempts. Please wait a few minutes or reset your password.";
    case 'auth/network-request-failed':
      return "Network error. Please check your internet connection and try again.";
    case 'auth/invalid-phone-number':
      return "Please enter a valid mobile number with country code (e.g. +1 234 567 8900).";
    case 'auth/invalid-verification-code':
      return "The verification code is incorrect. Please check the 6-digit SMS code and try again.";
    case 'auth/code-expired':
      return "The SMS verification code has expired. Please request a new code.";
    case 'auth/quota-exceeded':
      return "SMS limit reached. Please try again later or sign in with Email or Google.";
    case 'auth/popup-closed-by-user':
      return "Sign-in window was closed before completing authentication.";
    case 'auth/popup-blocked':
    case 'auth/cancelled-popup-request':
      return "Sign-in popup was blocked by your browser. Please allow popups to continue.";
    case 'auth/operation-not-allowed':
      return "SMS sign-in is not enabled for this country code in Firebase. Please enable the region in Firebase Console or sign in with Email / Google.";
    default:
      const cleanMessage = rawMessage
        .replace(/^Firebase:\s*/i, '')
        .replace(/Error\s*\(auth\/[^)]+\):?\s*/i, '')
        .replace(/\(auth\/[^)]+\)/g, '')
        .trim();
      return cleanMessage || "Authentication failed. Please check your details and try again.";
  }
};

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
    
    const newSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('pte_session_id', newSessionId);

    try {
      await signInWithPopup(auth, googleProvider);
      setShowAuthModal(false);
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr: any) {
          console.error("Fallback redirect sign-in error:", redirectErr);
        }
      }
      setIsAuthenticating(false);
      setAuthError(formatAuthError(error));
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
      try {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
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
      try {
        const cred = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
        const firebaseUser = cred.user;
        
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

        const newUser: UserData = {
          uid: firebaseUser.uid,
          email: authEmail.trim().toLowerCase(),
          phoneNumber: authPhone.trim() || null,
          displayName: authName.trim(),
          createdAt: now.toISOString(),
          accessType: 'user',
          subscriptionStatus: 'trial',
          trialEndsAt: trialEnds.toISOString(),
          activityLog: [getLocalDateStr(now)],
          completedTasks: [],
          completedTasksDetailed: [],
          taskScores: {},
          favoriteWords: [],
          schedule: [],
          goals: []
        };

        await setDoc(userRef, newUser);

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
        setIsAuthenticating(false);
        setAuthError(formatAuthError(err));
      }
    }
  };

  const handleSendPhoneOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!authPhone.trim()) return setAuthError("Please enter a valid phone number with country code (e.g. +1 234 567 8900).");

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

  const handleVerifyPhoneOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!otpCode.trim() || !confirmationResult) return setAuthError("Please enter the 6-digit code.");

    setIsAuthenticating(true);
    try {
      const cred = await confirmationResult.confirm(otpCode.trim());
      const firebaseUser = cred.user;

      const userRef = doc(db, 'users', firebaseUser.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        const now = new Date();
        const trialEnds = new Date();
        trialEnds.setDate(trialEnds.getDate() + 7);
        const newUser: UserData = {
          uid: firebaseUser.uid,
          phoneNumber: firebaseUser.phoneNumber || authPhone.trim(),
          displayName: `Ninja ${firebaseUser.phoneNumber?.slice(-4) || 'User'}`,
          createdAt: now.toISOString(),
          accessType: 'user',
          subscriptionStatus: 'trial',
          trialEndsAt: trialEnds.toISOString(),
          activityLog: [getLocalDateStr(now)],
          completedTasks: [],
          completedTasksDetailed: [],
          taskScores: {},
          favoriteWords: [],
          schedule: [],
          goals: []
        };
        await setDoc(userRef, newUser);
      }
      setShowAuthModal(false);
    } catch (err: any) {
      setIsAuthenticating(false);
      setAuthError(formatAuthError(err));
    }
  };

  const logout = async () => {
    try {
      localStorage.removeItem('pte_session_id');
      await auth.signOut();
      setShowAuthModal(false);
    } catch (error) {
      console.error("Logout failed:", error);
      setAuthError("Failed to sign out. Please try again.");
    }
  };

  const continueAsGuest = async () => {
    setShowGuestModal(true);
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
        setAuthError("Guest access (Anonymous Authentication) is not enabled in the Firebase Console. Please enable it in Authentication > Sign-in method.");
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
      authError,
      setAuthError,
      currency,
      formatPrice: (amount: number) => CurrencyService.format(CurrencyService.convert(amount)),
      pendingGuestWriteRef,
      isSyncingSubscription,
      setIsSyncingSubscription,
      isEmailVerified,
      resendEmailVerification,
      checkEmailVerification
    }}>
      {children}

      {/* Email Verification Required Overlay */}
      <AnimatePresence>
        {user && !isEmailVerified && user.accessType !== 'guest' && (
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
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          value={authPhone}
                          onChange={(e) => setAuthPhone(e.target.value)}
                          placeholder="+61 470 260 503"
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
                    placeholder="+1 234 567 8900"
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
