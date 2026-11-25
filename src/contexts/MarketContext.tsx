import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, logFirestoreError, OperationType } from '../services/firebase';
import { useAuth } from './AuthContext';
import { apiFetch } from '../services/api';
import { CRIPPO_DIRECTORY_300 } from '../data/crippoDirectory300';
import {
  isAgencyEntity,
  isBrandEntity,
  mergeDirectoryWithFirestore,
} from '../utils/entityDirectory';
import type {
  Race,
  Entity,
  Catalyst,
  PredictionMarket,
  Trade,
  Payment,
  DividendPayout,
  Campaign,
  Memo,
  NotificationItem,
  AffiliationRequest,
  IntegrationStatus,
} from '../types/crippo';

interface ToastState {
  title: string;
  message: string;
  tone?: 'success' | 'info' | 'error';
}

interface MarketContextValue {
  races: Race[];
  entities: Entity[];
  firestoreEntityIds: Set<string>;
  catalysts: Catalyst[];
  predictions: PredictionMarket[];
  campaigns: Campaign[];
  myTrades: Trade[];
  publicOrders: Trade[];
  myPayments: Payment[];
  myDividends: DividendPayout[];
  myMemos: Memo[];
  notifications: NotificationItem[];
  unreadNotifCount: number;
  affiliationRequests: AffiliationRequest[];
  integrationStatus: IntegrationStatus | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  toast: ToastState | null;
  showToast: (title: string, message: string, tone?: 'success' | 'info' | 'error') => void;
  dismissToast: () => void;
  isAdmin: boolean;
  claimedEntity: Entity | null;
  isClaimedCreator: boolean;
  isVerifiedCreator: boolean;
  isLabelAffiliatedCreator: boolean;
  isVerifiedAgency: boolean;
  canLaunchRace: boolean;
  markNotificationRead: (notifId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  acceptRaiseOffer: (raceId: string, notifId?: string) => Promise<void>;
  acceptAffiliationRequest: (req: AffiliationRequest, notifId?: string) => Promise<void>;
  declineAffiliationRequest: (req: AffiliationRequest, notifId?: string) => Promise<void>;
}

const MarketContext = createContext<MarketContextValue | undefined>(undefined);

const ADMIN_EMAIL = 'mangilerinelasliejr@gmail.com';

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const { user, emailVerified, profile } = useAuth();
  const [races, setRaces] = useState<Race[]>([]);
  const [liveEntities, setLiveEntities] = useState<Entity[]>([]);
  const [catalysts, setCatalysts] = useState<Catalyst[]>([]);
  const [predictions, setPredictions] = useState<PredictionMarket[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [myTrades, setMyTrades] = useState<Trade[]>([]);
  const [publicOrders, setPublicOrders] = useState<Trade[]>([]);
  const [myPayments, setMyPayments] = useState<Payment[]>([]);
  const [myDividends, setMyDividends] = useState<DividendPayout[]>([]);
  const [myMemos, setMyMemos] = useState<Memo[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [incomingAffiliations, setIncomingAffiliations] = useState<AffiliationRequest[]>([]);
  const [outgoingAffiliations, setOutgoingAffiliations] = useState<AffiliationRequest[]>([]);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const seenNotifIdsRef = React.useRef<Set<string> | null>(null);

  const isAdmin = Boolean(
    emailVerified && user?.email?.toLowerCase() === ADMIN_EMAIL
  );

  const firestoreEntityIds = React.useMemo(
    () => new Set(liveEntities.map((e) => e.id)),
    [liveEntities]
  );

  const entities = React.useMemo(
    () => mergeDirectoryWithFirestore(CRIPPO_DIRECTORY_300, liveEntities),
    [liveEntities]
  );

  const claimedEntity = React.useMemo(() => {
    if (!user) return null;
    return (
      entities.find((e) => e.isClaimed && e.claimedByUid === user.uid) ||
      (profile?.claimedEntityId
        ? entities.find((e) => e.id === profile.claimedEntityId && e.claimedByUid === user.uid)
        : undefined) ||
      null
    );
  }, [entities, user, profile?.claimedEntityId]);

  const isClaimedCreator = Boolean(
    user && claimedEntity && claimedEntity.isClaimed && claimedEntity.claimedByUid === user.uid
  );

  const isVerifiedCreator = Boolean(
    isClaimedCreator && claimedEntity?.kycStatus === 'verified'
  );

  const isVerifiedAgency = Boolean(
    isVerifiedCreator && claimedEntity && isAgencyEntity(claimedEntity)
  );

  const isLabelAffiliatedCreator = Boolean(
    isClaimedCreator &&
      claimedEntity &&
      !isAgencyEntity(claimedEntity) &&
      Boolean(claimedEntity.affiliatedAgencyId)
  );

  const canLaunchRace = Boolean(
    isAdmin ||
      (isVerifiedCreator &&
        claimedEntity &&
        !isBrandEntity(claimedEntity) &&
        !isLabelAffiliatedCreator)
  );

  const affiliationRequests = React.useMemo(() => {
    const map = new Map<string, AffiliationRequest>();
    for (const r of [...incomingAffiliations, ...outgoingAffiliations]) {
      map.set(r.id, r);
    }
    return Array.from(map.values());
  }, [incomingAffiliations, outgoingAffiliations]);

  const unreadNotifCount = React.useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const showToast = useCallback(
    (title: string, message: string, tone: 'success' | 'info' | 'error' = 'success') => {
      setToast({ title, message, tone });
    },
    []
  );

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    apiFetch<IntegrationStatus>('/api/integrations/status')
      .then(setIntegrationStatus)
      .catch(() => null);
  }, []);

  useEffect(() => {
    const unsubRaces = onSnapshot(
      isAdmin
        ? query(collection(db, 'races'), orderBy('createdAt', 'desc'), limit(60))
        : query(collection(db, 'races'), where('isPublic', '==', true), limit(60)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Race);
        setRaces(list);
      },
      (err) => logFirestoreError(err, OperationType.LIST, 'races')
    );

    const unsubEntities = onSnapshot(
      query(collection(db, 'entities'), where('isPublic', '==', true), limit(400)),
      (snap) => setLiveEntities(snap.docs.map((d) => d.data() as Entity)),
      (err) => logFirestoreError(err, OperationType.LIST, 'entities')
    );

    const unsubCatalysts = onSnapshot(
      query(collection(db, 'catalysts'), where('isPublic', '==', true), limit(60)),
      (snap) => setCatalysts(snap.docs.map((d) => d.data() as Catalyst)),
      (err) => logFirestoreError(err, OperationType.LIST, 'catalysts')
    );

    const unsubPredictions = onSnapshot(
      query(collection(db, 'predictions'), where('isPublic', '==', true), limit(30)),
      (snap) => setPredictions(snap.docs.map((d) => d.data() as PredictionMarket)),
      (err) => logFirestoreError(err, OperationType.LIST, 'predictions')
    );

    const unsubCampaigns = onSnapshot(
      query(collection(db, 'campaigns'), where('isPublic', '==', true), limit(40)),
      (snap) => setCampaigns(snap.docs.map((d) => d.data() as Campaign)),
      (err) => logFirestoreError(err, OperationType.LIST, 'campaigns')
    );

    return () => {
      unsubRaces();
      unsubEntities();
      unsubCatalysts();
      unsubPredictions();
      unsubCampaigns();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!user) {
      seenNotifIdsRef.current = null;
      setMyTrades([]);
      setPublicOrders([]);
      setMyPayments([]);
      setMyDividends([]);
      setMyMemos([]);
      setNotifications([]);
      setIncomingAffiliations([]);
      setOutgoingAffiliations([]);
      return;
    }

    seenNotifIdsRef.current = null;

    const unsubMyTrades = onSnapshot(
      query(collection(db, 'trades'), where('buyerUid', '==', user.uid), limit(80)),
      (snap) => setMyTrades(snap.docs.map((d) => d.data() as Trade)),
      (err) => logFirestoreError(err, OperationType.LIST, 'trades')
    );

    const unsubPublicOrders = onSnapshot(
      query(collection(db, 'trades'), where('isPublicOrderBook', '==', true), limit(80)),
      (snap) => setPublicOrders(snap.docs.map((d) => d.data() as Trade)),
      (err) => logFirestoreError(err, OperationType.LIST, 'trades')
    );

    const unsubPayments = onSnapshot(
      isAdmin
        ? query(collection(db, 'payments'), limit(80))
        : query(collection(db, 'payments'), where('uid', '==', user.uid), limit(80)),
      (snap) => setMyPayments(snap.docs.map((d) => d.data() as Payment)),
      (err) => logFirestoreError(err, OperationType.LIST, 'payments')
    );

    const unsubDividends = onSnapshot(
      isAdmin
        ? query(collection(db, 'dividend_payouts'), limit(80))
        : query(collection(db, 'dividend_payouts'), where('recipientUid', '==', user.uid), limit(80)),
      (snap) => setMyDividends(snap.docs.map((d) => d.data() as DividendPayout)),
      (err) => logFirestoreError(err, OperationType.LIST, 'dividend_payouts')
    );

    const unsubMemos = onSnapshot(
      isAdmin
        ? query(collection(db, 'memos'), limit(60))
        : query(collection(db, 'memos'), where('requesterUid', '==', user.uid), limit(40)),
      (snap) => setMyMemos(snap.docs.map((d) => d.data() as Memo)),
      (err) => logFirestoreError(err, OperationType.LIST, 'memos')
    );

    const getNotifTime = (n: NotificationItem): number => {
      const ts = n.createdAt as { toMillis?: () => number; seconds?: number } | undefined;
      if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
      if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
      const fromId = Number(n.id?.split('_')[1]);
      return Number.isFinite(fromId) ? fromId : 0;
    };

    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications'), where('recipientUid', '==', user.uid), limit(40)),
      (snap) => {
        const docs = snap.docs
          .map((d) => d.data() as NotificationItem)
          .sort((a, b) => getNotifTime(b) - getNotifTime(a));

        if (seenNotifIdsRef.current !== null) {
          const newlyArrived = docs.find(
            (d) => !d.read && !seenNotifIdsRef.current?.has(d.id)
          );
          if (newlyArrived) {
            setToast({
              title: newlyArrived.title,
              message: newlyArrived.message,
              tone: newlyArrived.type === 'kyc_rejected' || newlyArrived.type === 'raise_rejected' ? 'info' : 'success',
            });
          }
        }
        seenNotifIdsRef.current = new Set(docs.map((d) => d.id));
        setNotifications(docs);
      },
      (err) => logFirestoreError(err, OperationType.LIST, 'notifications')
    );

    const unsubAffCreator = onSnapshot(
      query(collection(db, 'affiliation_requests'), where('creatorUid', '==', user.uid), limit(30)),
      (snap) => setIncomingAffiliations(snap.docs.map((d) => d.data() as AffiliationRequest)),
      (err) => logFirestoreError(err, OperationType.LIST, 'affiliation_requests')
    );

    const unsubAffAgency = onSnapshot(
      query(collection(db, 'affiliation_requests'), where('agencyUid', '==', user.uid), limit(30)),
      (snap) => setOutgoingAffiliations(snap.docs.map((d) => d.data() as AffiliationRequest)),
      (err) => logFirestoreError(err, OperationType.LIST, 'affiliation_requests')
    );

    return () => {
      unsubMyTrades();
      unsubPublicOrders();
      unsubPayments();
      unsubDividends();
      unsubMemos();
      unsubNotifs();
      unsubAffCreator();
      unsubAffAgency();
    };
  }, [user, isAdmin]);

  const markNotificationRead = useCallback(async (notifId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { read: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${notifId}`);
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    try {
      await Promise.all(
        unread.map((n) => updateDoc(doc(db, 'notifications', n.id), { read: true }))
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications/batch');
    }
  }, [notifications]);

  const acceptRaiseOffer = useCallback(
    async (raceId: string, notifId?: string) => {
      try {
        await updateDoc(doc(db, 'races', raceId), {
          status: 'open',
          isPublic: true,
          updatedAt: serverTimestamp(),
        });
        if (notifId) {
          await updateDoc(doc(db, 'notifications', notifId), { read: true });
        }
        showToast(
          'Raise Live on Market!',
          'Share split accepted. Fans can now buy and trade shares via Fapshi Mobile Money.'
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `races/${raceId}`);
      }
    },
    [showToast]
  );

  const acceptAffiliationRequest = useCallback(
    async (req: AffiliationRequest, notifId?: string) => {
      if (!user) return;
      try {
        await updateDoc(doc(db, 'affiliation_requests', req.id), {
          status: 'accepted',
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'entities', req.creatorEntityId), {
          affiliatedAgencyId: req.agencyEntityId,
          affiliatedAgencyUid: req.agencyUid,
          agencyName: req.agencyName,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'users', user.uid), {
          affiliationType: 'agency',
          agencyName: req.agencyName,
          updatedAt: serverTimestamp(),
        });
        if (notifId) {
          await updateDoc(doc(db, 'notifications', notifId), { read: true });
        }
        showToast(
          'Label Affiliation Active',
          `${req.creatorStageName} is now officially rostered under ${req.agencyName}.`
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `affiliation_requests/${req.id}`);
      }
    },
    [user, showToast]
  );

  const declineAffiliationRequest = useCallback(
    async (req: AffiliationRequest, notifId?: string) => {
      try {
        await updateDoc(doc(db, 'affiliation_requests', req.id), {
          status: 'declined',
          updatedAt: serverTimestamp(),
        });
        if (notifId) {
          await updateDoc(doc(db, 'notifications', notifId), { read: true });
        }
        showToast('Affiliation Declined', `Invitation from ${req.agencyName} declined.`, 'info');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `affiliation_requests/${req.id}`);
      }
    },
    [showToast]
  );

  return (
    <MarketContext.Provider
      value={{
        races,
        entities,
        firestoreEntityIds,
        catalysts,
        predictions,
        campaigns,
        myTrades,
        publicOrders,
        myPayments,
        myDividends,
        myMemos,
        notifications,
        unreadNotifCount,
        affiliationRequests,
        integrationStatus,
        searchQuery,
        setSearchQuery,
        toast,
        showToast,
        dismissToast,
        isAdmin,
        claimedEntity,
        isClaimedCreator,
        isVerifiedCreator,
        isLabelAffiliatedCreator,
        isVerifiedAgency,
        canLaunchRace,
        markNotificationRead,
        markAllNotificationsRead,
        acceptRaiseOffer,
        acceptAffiliationRequest,
        declineAffiliationRequest,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used inside MarketProvider');
  return ctx;
}
