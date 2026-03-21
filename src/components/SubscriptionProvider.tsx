import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db, onAuthStateChanged, signInWithPopup, signInAnonymously, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { UserData, SUBSCRIPTION_PLANS } from '../types';
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
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setLoading(true);
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Listen for real-time updates to user data
        const unsubDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUser(docSnap.data() as UserData);
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
              // If it's a permission error and we're anonymous, it might be due to the provider being disabled
              if (firebaseUser.isAnonymous && err.code === 'permission-denied') {
                console.warn("Could not create guest profile in Firestore. This usually happens if Anonymous Auth is disabled in the console.");
              } else {
                handleFirestoreError(err, OperationType.CREATE, `users/${firebaseUser.uid}`);
              }
            });
            setUser(newUser);
          }
          setLoading(false);
          setIsAuthenticating(false);
        }, (err) => {
          // If we're anonymous and get a permission error, it's likely the same root cause
          if (firebaseUser.isAnonymous && err.code === 'permission-denied') {
            console.warn("Could not read guest profile from Firestore.");
            // We can still set a local guest user so the app doesn't crash
            if (!user) {
              setUser({
                uid: firebaseUser.uid,
                createdAt: new Date().toISOString(),
                accessType: 'guest',
                subscriptionStatus: 'guest'
              });
            }
          } else {
            handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
          }
          setLoading(false);
          setIsAuthenticating(false);
        });

        return () => unsubDoc();
      } else {
        setUser(null);
        setLoading(false);
        setIsAuthenticating(false);
        setShowAuthModal(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    try {
      await signInWithPopup(auth, googleProvider);
      setShowAuthModal(false);
    } catch (error) {
      console.error("Login failed:", error);
      setIsAuthenticating(false);
    }
  };

  const logout = async () => {
    await auth.signOut();
    setShowAuthModal(true);
  };

  const [authError, setAuthError] = useState<string | null>(null);

  const continueAsGuest = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setAuthError(null);
    try {
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

  const isAccessRestricted = !loading && !checkAccess();

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
      setAuthError
    }}>
      {children}
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
