import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, logFirestoreError, OperationType } from '../services/firebase';
import type { MomoProvider, UserPrivate, UserPublic } from '../types/crippo';

interface AuthContextValue {
  user: User | null;
  emailVerified: boolean;
  profile: UserPublic | null;
  privateInfo: UserPrivate | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  refreshUser: () => Promise<boolean>;
  signOut: () => Promise<void>;
  completeOnboarding: (data: {
    displayName: string;
    city: string;
    phone: string;
    interests: string[];
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function detectMomoProvider(phone: string): MomoProvider {
  const clean = phone.replace(/\D/g, '');
  const local = clean.startsWith('237') ? clean.slice(3) : clean;
  if (/^6(50|51|52|53|54|7[0-9]|8[0-4])/.test(local)) return 'MTN';
  if (/^6(55|56|57|58|59|9[0-9]|8[5-9])/.test(local)) return 'ORANGE';
  return 'OTHER';
}

function generateAnonymousId(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) % 9000;
  }
  return `Trader #${1000 + Math.abs(hash)}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [profile, setProfile] = useState<UserPublic | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let unsubPrivate: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
      setEmailVerified(Boolean(fbUser?.emailVerified));
      if (unsubProfile) unsubProfile();
      if (unsubPrivate) unsubPrivate();

      if (!fbUser) {
        setProfile(null);
        setPrivateInfo(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const publicPath = `users/${fbUser.uid}`;
      const privatePath = `users/${fbUser.uid}/private/info`;

      unsubProfile = onSnapshot(
        doc(db, 'users', fbUser.uid),
        (snap) => {
          setProfile(snap.exists() ? (snap.data() as UserPublic) : null);
          setLoading(false);
        },
        (err) => {
          setLoading(false);
          logFirestoreError(err, OperationType.GET, publicPath);
        }
      );

      unsubPrivate = onSnapshot(
        doc(db, 'users', fbUser.uid, 'private', 'info'),
        (snap) => {
          setPrivateInfo(snap.exists() ? (snap.data() as UserPrivate) : null);
        },
        (err) => {
          logFirestoreError(err, OperationType.GET, privatePath);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
      if (unsubPrivate) unsubPrivate();
    };
  }, []);

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (cred.user && !cred.user.emailVerified) {
      await sendEmailVerification(cred.user);
    }
  };

  const refreshUser = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    const verified = Boolean(auth.currentUser.emailVerified);
    setEmailVerified(verified);
    return verified;
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const completeOnboarding = async (data: {
    displayName: string;
    city: string;
    phone: string;
    interests: string[];
  }) => {
    if (!user) throw new Error('Not signed in.');
    const cleanPhone = data.phone.replace(/\D/g, '');
    if (!/^2376[0-9]{8}$/.test(cleanPhone)) {
      throw new Error('Phone must follow Cameroon format 2376XXXXXXXX.');
    }

    const provider = detectMomoProvider(cleanPhone);
    const anonId = profile?.anonymousId || generateAnonymousId(user.uid);

    const publicRef = doc(db, 'users', user.uid);
    const privateRef = doc(db, 'users', user.uid, 'private', 'info');

    try {
      await setDoc(publicRef, {
        uid: user.uid,
        anonymousId: anonId,
        displayName: data.displayName.trim().slice(0, 80),
        city: data.city.trim().slice(0, 40),
        interests: data.interests.slice(0, 10),
        onboardingComplete: true,
        creatorModeEnabled: profile?.creatorModeEnabled ?? false,
        kycStatus: profile?.kycStatus ?? 'none',
        createdAt: profile?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }

    try {
      await setDoc(privateRef, {
        uid: user.uid,
        email: user.email || '',
        phone: cleanPhone,
        momoProvider: provider,
        fullNameLegal: data.displayName.trim().slice(0, 120),
        createdAt: privateInfo?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/private/info`);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        emailVerified,
        profile,
        privateInfo,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        refreshUser,
        signOut,
        completeOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
