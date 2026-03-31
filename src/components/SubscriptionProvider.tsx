import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db, onAuthStateChanged, signInWithPopup, signInAnonymously, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { UserData, SUBSCRIPTION_PLANS } from '../types';
import { CurrencyService, CurrencyInfo } from '../services/currencyService';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Zap, Check, X, ShieldCheck, CreditCard, User, LogOut } from 'lucide-react';

interface SubscriptionContextType {
  user: UserData | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  isAccessRestricted: boolean;
  showSubscriptionModal: boolean;
  setShowSubscriptionModal: (show: boolean) => void;
  authError: string | null;
  setAuthError: (error: string | null) => void;
  currency: CurrencyInfo;
  formatPrice: (amount: number) => string;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<CurrencyInfo>(CurrencyService.getCurrentCurrency());

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

      if (firebaseUser) {
        setLoading(true);
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Handle session ID
        let localSessionId = localStorage.getItem('pte_session_id');
        if (!localSessionId) {
          localSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          localStorage.setItem('pte_session_id', localSessionId);
          
          // Update firestore with new session ID
          updateDoc(userRef, { currentSessionId: localSessionId }).catch(() => {
            // If doc doesn't exist yet, it will be created in the snapshot listener's else block
          });
        }

        // Listen for real-time updates to user data
        unsubDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data() as UserData;
            
            // Session check
            const currentLocalSessionId = localStorage.getItem('pte_session_id');
            if (userData.currentSessionId && currentLocalSessionId && userData.currentSessionId !== currentLocalSessionId) {
              // Another device logged in
              auth.signOut();
              localStorage.removeItem('pte_session_id');
              setSessionError("You have been signed out because your account is being used on another device.");
              return;
            }

            setUser(userData);
          } else {
            // New user or guest
            const isGuest = firebaseUser.isAnonymous;
            const now = new Date();
            const createdAt = now.toISOString();
            
            const newUser: UserData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || null,
              displayName: firebaseUser.displayName || null,
              createdAt,
              accessType: isGuest ? 'guest' : 'user',
              subscriptionStatus: isGuest ? 'guest' : 'trial',
              trialEndsAt: isGuest ? undefined : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
              activityLog: [now.toISOString().split('T')[0]],
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
            // and don't have a pending auth error
            setDoc(userRef, firestoreData).catch(err => {
              const isPermissionError = err.code === 'permission-denied' || 
                                       (err.message && err.message.toLowerCase().includes('insufficient permissions'));
              
              // If it's a permission error and we're anonymous, it might be due to the provider being disabled
              if (firebaseUser.isAnonymous && isPermissionError) {
                console.warn("Could not create guest profile in Firestore. This usually happens if Anonymous Auth is disabled in the console. Error code:", err.code);
              } else {
                handleFirestoreError(err, OperationType.CREATE, `users/${firebaseUser.uid}`);
              }
            });
            setUser(newUser);
          }
          setLoading(false);
          setIsAuthenticating(false);
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
        setShowAuthModal(true);
      }
    });

    return () => {
      unsubscribe();
      if (unsubDoc) unsubDoc();
    };
  }, []);

  const login = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setAuthError(null);
    setSessionError(null);
    try {
      const newSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('pte_session_id', newSessionId);
      
      await signInWithPopup(auth, googleProvider);
      setShowAuthModal(false);
    } catch (error: any) {
      setIsAuthenticating(false);
      
      // Handle known Firebase Auth errors gracefully
      if (error.code === 'auth/popup-closed-by-user') {
        // Silent error as it's user-initiated, but we can set a friendly message if needed
        setAuthError("The sign-in window was closed. Please try again to continue.");
        return;
      }
      
      if (error.code === 'auth/unauthorized-domain') {
        const currentDomain = window.location.hostname;
        setAuthError(`This domain (${currentDomain}) is not authorized for login. Please add it to the 'Authorized domains' list in the Firebase Console (Authentication > Settings > Authorized domains). 

Required domains:
1. ${currentDomain}
2. ais-dev-hto7hpsjflk4jaqmoohjpi-723280175369.asia-southeast1.run.app
3. ais-pre-hto7hpsjflk4jaqmoohjpi-723280175369.asia-southeast1.run.app

Console link: https://console.firebase.google.com/project/gen-lang-client-0336907942/authentication/settings`);
        return;
      }
      
      console.error("Login failed:", error);
      
      if (error.code === 'auth/cancelled-popup-request') {
        setAuthError("Sign-in was interrupted. Please try again.");
      } else if (error.code === 'auth/popup-blocked') {
        setAuthError("The sign-in popup was blocked by your browser. Please allow popups for this site.");
      } else {
        setAuthError("Login failed. Please check your connection and try again.");
      }
    }
  };

  const logout = async () => {
    try {
      localStorage.removeItem('pte_session_id');
      await auth.signOut();
      setShowAuthModal(true);
    } catch (error) {
      console.error("Logout failed:", error);
      setAuthError("Failed to sign out. Please try again.");
    }
  };

  const continueAsGuest = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setAuthError(null);
    setSessionError(null);
    try {
      const newSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('pte_session_id', newSessionId);
      
      await signInAnonymously(auth);
      setShowAuthModal(false);
    } catch (error: any) {
      console.error("Guest login failed:", error);
      setIsAuthenticating(false);
      if (error.code === 'auth/admin-restricted-operation') {
        setAuthError("Guest access (Anonymous Authentication) is not enabled in the Firebase Console. Please enable it in Authentication > Sign-in method.");
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
      const today = new Date().toISOString().split('T')[0];
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
    if (isAccessRestricted && !loading) {
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
      formatPrice: (amount: number) => CurrencyService.format(CurrencyService.convert(amount))
    }}>
      {children}
      
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
              <button
                onClick={() => setSessionError(null)}
                className="w-full py-3 px-6 bg-primary text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
              >
                Got it
              </button>
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
