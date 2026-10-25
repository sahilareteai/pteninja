import { initializeApp, FirebaseError } from 'firebase/app';
import { 
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signInAnonymously, 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  linkWithCredential,
  linkWithPhoneNumber,
  unlink,
  EmailAuthProvider,
  User as FirebaseUser,
  signInWithCredential
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, getDocFromServer, collection, getDocs, query, where, addDoc, deleteField } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { isNativeMobile } from './lib/mobile';

// Initialize Firebase SDK
export const app = initializeApp(firebaseConfig);

/**
 * On native iOS / Android WKWebView containers (e.g. capacitor://localhost),
 * Firebase Web SDK's default indexedDBLocalPersistence can hang indefinitely
 * due to WebKit storage isolation bugs. Using browserLocalPersistence (localStorage)
 * on mobile guarantees instant, non-blocking authentication.
 */
function getOrInitializeAuth() {
  try {
    return initializeAuth(app, {
      persistence: isNativeMobile()
        ? [browserLocalPersistence]
        : [indexedDBLocalPersistence, browserLocalPersistence]
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = getOrInitializeAuth();
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

// Connection test (Development mode only)
if (import.meta.env.DEV) {
  getDocFromServer(doc(db, 'test', 'connection'))
    .then(() => {})
    .catch(() => {});
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  if (error instanceof FirebaseError && error.code === 'resource-exhausted') {
    console.warn('Firestore write stream temporarily exhausted; Firebase is retrying automatically.', { operationType, path });
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { 
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
  signInWithCredential,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPhoneNumber,
  unlink,
  EmailAuthProvider,
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  setDoc, 
  addDoc, 
  deleteField 
};
export type { FirebaseUser, ConfirmationResult };
