import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  Ticket, 
  Search, 
  CheckCircle, 
  XCircle, 
  Plus, 
  Trash2, 
  Shield,
  CreditCard,
  Clock,
  User as UserIcon,
  Loader2,
  RefreshCw,
  Eye,
  ShieldCheck,
  BarChart3,
  TrendingUp,
  MessageSquare,
  Key,
  Activity,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Users2,
  Globe,
  Mic,
  PenTool,
  BookOpen,
  Headphones,
  ArrowLeft,
  Hash,
  Cpu,
  Target,
  Calendar,
  Award,
} from 'lucide-react';
import { db, collection, getDocs, getDoc, doc, updateDoc, setDoc, OperationType, handleFirestoreError, auth } from '../firebase';
import { UserData, SUBSCRIPTION_PLANS, PTE_TASKS } from '../types';
import { PromoCode } from '../services/promoService';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

interface AdminUser extends UserData {
  uid: string;
}

interface AnalyticsData {
  users: {
    totalUsers: number;
    paidUsers: number;
    trialUsers: number;
    guestUsers: number;
    planCounts: Record<string, number>;
    signupsByDay: Record<string, number>;
  };
  tasks: {
    sectionCounts: Record<string, number>;
    topTasks: { taskId: string; count: number }[];
  };
  visitors: {
    totalVisits: number;
    dailyVisits: Record<string, number>;
  };
  support: {
    topics: Record<string, number>;
    totalTickets: number;
    ticketCategories: Record<string, number>;
  };
}

interface GeminiKeyStatus {
  totalKeys: number;
  availableKeys: number;
  vertexKeyCount: number;
  geminiKeyCount: number;
  lastSyncedAt: number | null;
  keys: { index: number; isVertex: boolean; available: boolean; exhaustedUntil: number | null; cooldownRemainingSeconds: number; consecutiveExhaustions: number; callCount: number; totalInputTokens: number; totalOutputTokens: number; nonQuotaErrorCount: number }[];
  dailyTokens: Record<string, { textInput: number; textOutput: number; ttsInput: number; ttsOutput: number }>;
  tts: {
    availableKeys: number;
    vertexKeyCount: number;
    geminiKeyCount: number;
    lastSyncedAt: number | null;
    keys: { index: number; isVertex: boolean; available: boolean; exhaustedUntil: number | null; cooldownRemainingSeconds: number; consecutiveExhaustions: number; callCount: number; totalInputTokens: number; totalOutputTokens: number; nonQuotaErrorCount: number }[];
  };
}

// Map task IDs to their category names using PTE_TASKS
const TASK_CATEGORY_MAP = Object.fromEntries(PTE_TASKS.map(t => [t.id, t.category]));

export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'users' | 'promoCodes' | 'apiKeys'>('analytics');
  const [userFilter, setUserFilter] = useState<'all' | 'paid' | 'guests'>('all');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingPromo, setIsAddingPromo] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isPurgingGuests, setIsPurgingGuests] = useState(false);
  const [roleChangingUid, setRoleChangingUid] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<GeminiKeyStatus | null>(null);
  const [geminiRefreshing, setGeminiRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isOverridingSubscription, setIsOverridingSubscription] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState<UserData['subscriptionStatus']>('inactive');
  const [overridePlan, setOverridePlan] = useState<string>('');
  const [overrideEndsAt, setOverrideEndsAt] = useState<string>('');
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const hasFetchedUsers = useRef(false);
  const hasFetchedPromos = useRef(false);
  const hasFetchedAnalytics = useRef(false);
  const [newPromo, setNewPromo] = useState<PromoCode>({
    code: '',
    discountPercent: 10,
    description: '',
    isActive: true
  });

  useEffect(() => {
    if (activeTab === 'analytics' && !hasFetchedAnalytics.current) {
      fetchAnalytics();
    } else if (activeTab === 'users') {
      fetchData(false);
    } else if (activeTab === 'promoCodes') {
      fetchData(false);
      seedInitialCodes();
    } else if (activeTab === 'apiKeys') {
      fetchGeminiStatus();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedUser) {
      setOverrideStatus(selectedUser.subscriptionStatus || 'inactive');
      setOverridePlan(selectedUser.planId || '');
      if (selectedUser.subscriptionEndsAt) {
        try {
          const date = new Date(selectedUser.subscriptionEndsAt);
          if (!isNaN(date.getTime())) {
            setOverrideEndsAt(date.toISOString().split('T')[0]);
          } else {
            setOverrideEndsAt('');
          }
        } catch {
          setOverrideEndsAt('');
        }
      } else {
        setOverrideEndsAt('');
      }
    }
  }, [selectedUser]);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) return;
      const response = await fetch('/api/admin-analytics', {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      setAnalytics(data);
      hasFetchedAnalytics.current = true;
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGeminiStatus = async () => {
    setGeminiRefreshing(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) return;
      const response = await fetch('/api/gemini-key-status', {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      setGeminiStatus(data);
    } catch (error) {
      console.error('Error fetching Gemini status:', error);
    } finally {
      setGeminiRefreshing(false);
    }
  };

  const seedInitialCodes = async () => {
    const initialCodes = [
      { code: 'NINJA-PTE-SPECIAL-10', discountPercent: 10, description: 'Additional 10% off special discount', isActive: true },
      { code: 'NINJA-PTE-SPECIAL-25', discountPercent: 25, description: 'Additional 25% off special discount', isActive: true },
      { code: 'NINJA-PTE-SPECIAL-50', discountPercent: 50, description: 'Additional 50% off special discount', isActive: true },
    ];
    try {
      for (const promo of initialCodes) {
        const promoRef = doc(db, 'promoCodes', promo.code);
        const docSnap = await getDoc(promoRef);
        if (!docSnap.exists()) {
          await setDoc(promoRef, promo);
        }
      }
    } catch (error) {
      console.error('Error seeding promo codes:', error);
    }
  };

  const handleRoleChange = async (targetUser: AdminUser, newRole: 'admin' | 'user') => {
    setRoleChangingUid(targetUser.uid);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');
      const response = await fetch('/api/set-user-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ uid: targetUser.uid, role: newRole }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? 'Failed to change role');
      }
      setUsers(prev => prev.map(u => u.uid === targetUser.uid ? { ...u, role: newRole } : u));
      toast.success(`${targetUser.displayName || targetUser.email || targetUser.uid} is now ${newRole === 'admin' ? 'an Admin' : 'a regular user'}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change role');
    } finally {
      setRoleChangingUid(null);
    }
  };

  const fetchData = async (force = false) => {
    if (activeTab === 'users' && hasFetchedUsers.current && !force) return;
    if (activeTab === 'promoCodes' && hasFetchedPromos.current && !force) return;
    setIsLoading(true);
    try {
      if (activeTab === 'users') {
        const querySnapshot = await getDocs(collection(db, 'users'));
        const usersList: AdminUser[] = [];
        querySnapshot.forEach((doc) => {
          usersList.push({ uid: doc.id, ...doc.data() } as AdminUser);
        });
        setUsers(usersList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        hasFetchedUsers.current = true;
      } else {
        const querySnapshot = await getDocs(collection(db, 'promoCodes'));
        const promoList: PromoCode[] = [];
        querySnapshot.forEach((doc) => {
          promoList.push(doc.data() as PromoCode);
        });
        setPromoCodes(promoList);
        hasFetchedPromos.current = true;
      }
    } catch (error) {
      console.error('Error fetching admin data:', error);
      handleFirestoreError(error, OperationType.GET, activeTab === 'users' ? 'users' : 'promoCodes');
    } finally {
      setIsLoading(false);
    }
  };

  const togglePromoStatus = async (promo: PromoCode) => {
    try {
      const promoRef = doc(db, 'promoCodes', promo.code.toUpperCase());
      await updateDoc(promoRef, { isActive: !promo.isActive });
      setPromoCodes(prev => prev.map(p => p.code === promo.code ? { ...p, isActive: !p.isActive } : p));
      toast.success(`Promo code ${promo.code} ${!promo.isActive ? 'activated' : 'deactivated'}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `promoCodes/${promo.code}`);
    }
  };

  const handleAddPromo = async () => {
    if (!newPromo.code || newPromo.discountPercent <= 0) {
      toast.error('Please provide a valid code and discount');
      return;
    }
    try {
      const codeId = newPromo.code.toUpperCase();
      const promoRef = doc(db, 'promoCodes', codeId);
      const promoData = { ...newPromo, code: codeId };
      await setDoc(promoRef, promoData);
      setPromoCodes(prev => [...prev, promoData]);
      setIsAddingPromo(false);
      setNewPromo({ code: '', discountPercent: 10, description: '', isActive: true });
      toast.success('Promo code added successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'promoCodes');
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    const deletedUser = userToDelete; // capture before any state update
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');
      const response = await fetch('/api/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ uid: deletedUser.uid }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? 'Failed to delete user');
      }
      setUsers(prev => prev.filter(u => u.uid !== deletedUser.uid));
      // Keep analytics counts in sync so the Analytics tab reflects the deletion
      // immediately, without waiting for a full re-fetch.
      setAnalytics(prev => {
        if (!prev) return prev;
        const wasActive = deletedUser.subscriptionStatus === 'active';
        const wasTrial = deletedUser.subscriptionStatus === 'trial';
        const wasGuest = deletedUser.accessType === 'guest';
        return {
          ...prev,
          users: {
            ...prev.users,
            totalUsers: Math.max(0, prev.users.totalUsers - 1),
            paidUsers: wasActive ? Math.max(0, prev.users.paidUsers - 1) : prev.users.paidUsers,
            trialUsers: wasTrial ? Math.max(0, prev.users.trialUsers - 1) : prev.users.trialUsers,
            guestUsers: wasGuest ? Math.max(0, prev.users.guestUsers - 1) : prev.users.guestUsers,
          },
        };
      });
      // Force the analytics to re-fetch fresh data next time the tab is visited
      hasFetchedAnalytics.current = false;
      hasFetchedUsers.current = false;
      toast.success(`User ${deletedUser.displayName || deletedUser.email || deletedUser.uid} deleted`);
      setUserToDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete user');
      console.error('Delete user error:', error);
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handlePurgeStaleGuests = async () => {
    setIsPurgingGuests(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');
      const response = await fetch('/api/purge-stale-guests', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? 'Failed to purge stale guests');
      }
      const { deleted } = await response.json();
      toast.success(`Purged ${deleted} stale guest session${deleted !== 1 ? 's' : ''}`);
      hasFetchedUsers.current = false;
      hasFetchedAnalytics.current = false;
      await fetchData(true);
      await fetchAnalytics();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to purge stale guests');
      console.error('Purge stale guests error:', error);
    } finally {
      setIsPurgingGuests(false);
    }
  };

  const handleSetSubscription = async () => {
    if (!selectedUser) return;
    setIsOverridingSubscription(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch('/api/admin/set-user-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          uid: selectedUser.uid,
          subscriptionStatus: overrideStatus,
          planId: overridePlan || null,
          subscriptionEndsAt: overrideEndsAt ? new Date(overrideEndsAt).toISOString() : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? 'Failed to update subscription');
      }

      const updatedFields = {
        subscriptionStatus: overrideStatus,
        planId: overridePlan || undefined,
        subscriptionEndsAt: overrideEndsAt ? new Date(overrideEndsAt).toISOString() : undefined
      };

      setUsers(prev => prev.map(u => u.uid === selectedUser.uid ? { ...u, ...updatedFields } : u));
      setSelectedUser(prev => prev ? { ...prev, ...updatedFields } : null);

      toast.success(`Subscription updated for ${selectedUser.displayName || selectedUser.email}`);
      setShowOverrideConfirm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update subscription');
    } finally {
      setIsOverridingSubscription(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         u.displayName?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (userFilter === 'paid') return u.subscriptionStatus === 'active';
    if (userFilter === 'guests') return u.accessType === 'guest';
    return true;
  });

  const guestCount = users.filter(u => u.accessType === 'guest').length;
  const paidCount = users.filter(u => u.subscriptionStatus === 'active').length;

  // ─── Analytics helpers ──────────────────────────────────────────────────────

  function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 h-2 bg-app-primary/10 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] font-bold text-app-text-muted w-8 text-right">{pct}%</span>
      </div>
    );
  }

  function VisitorBar({ label, value, max }: { label: string; value: number; max: number }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
      <div className="flex flex-col items-center gap-1 flex-1">
        <div className="w-full flex flex-col justify-end" style={{ height: 60 }}>
          <div
            className="w-full bg-app-primary/70 rounded-t transition-all duration-700"
            style={{ height: `${Math.max(pct, 4)}%`, minHeight: value > 0 ? 4 : 0 }}
          />
        </div>
        <div className="text-[9px] text-app-text-muted font-bold">{label.slice(5) || label}</div>
        <div className="text-[10px] font-black text-app-text">{value}</div>
      </div>
    );
  }

  const SECTION_META = {
    speaking: { icon: Mic, color: 'text-blue-400', bg: 'bg-blue-400/10', bar: 'bg-blue-400' },
    writing: { icon: PenTool, color: 'text-purple-400', bg: 'bg-purple-400/10', bar: 'bg-purple-400' },
    reading: { icon: BookOpen, color: 'text-green-400', bg: 'bg-green-400/10', bar: 'bg-green-400' },
    listening: { icon: Headphones, color: 'text-orange-400', bg: 'bg-orange-400/10', bar: 'bg-orange-400' },
  };

  // ─── Key Card Helper ────────────────────────────────────────────────────────
  function KeyCard({ keyData, prefix, positionIndex }: {
    keyData: GeminiKeyStatus['keys'][number];
    prefix: string;
    positionIndex: number;
  }) {
    const totalTokens = keyData.totalInputTokens + keyData.totalOutputTokens;
    const formatTokens = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);
    return (
      <div className={cn(
        "border rounded-xl p-4 space-y-2",
        keyData.available ? "border-green-400/30 bg-green-400/5" : "border-red-400/30 bg-red-400/5"
      )}>
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-bold text-app-text">{prefix} #{positionIndex + 1}</span>
          <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold',
            keyData.available ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
          )}>
            {keyData.available ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
            {keyData.available ? 'Available' : 'Exhausted'}
          </div>
        </div>
        {!keyData.available && keyData.cooldownRemainingSeconds > 0 && (
          <div className="text-[11px] text-orange-400 font-bold">
            Cooldown: {keyData.cooldownRemainingSeconds}s remaining
          </div>
        )}
        {/* Usage stats */}
        <div className="grid grid-cols-2 gap-1 pt-1">
          <div className="bg-app-primary/5 rounded-lg p-1.5 text-center">
            <div className="text-[10px] font-black text-app-text">{keyData.callCount}</div>
            <div className="text-[9px] text-app-text-muted uppercase tracking-wide">Calls</div>
          </div>
          <div className="bg-app-primary/5 rounded-lg p-1.5 text-center">
            <div className="text-[10px] font-black text-app-text">{formatTokens(totalTokens)}</div>
            <div className="text-[9px] text-app-text-muted uppercase tracking-wide">Tokens</div>
          </div>
        </div>
        {totalTokens > 0 && (
          <div className="text-[9px] text-app-text-muted flex justify-between">
            <span>↑ {formatTokens(keyData.totalInputTokens)} in</span>
            <span>↓ {formatTokens(keyData.totalOutputTokens)} out</span>
          </div>
        )}
        {keyData.consecutiveExhaustions > 0 && (
          <div className="text-[10px] text-app-text-muted">
            Exhaustions: {keyData.consecutiveExhaustions}×
          </div>
        )}
        {keyData.nonQuotaErrorCount > 0 && (
          <div className="text-[10px] text-orange-400">
            ⚠ Non-quota errors: {keyData.nonQuotaErrorCount}×
          </div>
        )}
        <div className="h-1.5 bg-app-primary/10 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', keyData.available ? 'bg-green-400' : 'bg-red-400')}
            style={{ width: keyData.available ? '100%' : `${Math.max(0, 100 - (keyData.consecutiveExhaustions * 25))}%` }}
          />
        </div>
      </div>
    );
  }

  // ─── User Engagement helpers ─────────────────────────────────────────────────
  function getUserEngagementStats(user: AdminUser) {
    const scores = user.taskScores ?? {};
    const speakingPrefixes = ["ra-", "rs-", "di-", "rsit-", "sgd-", "rl-", "asq-"];
    const writingPrefixes = ["swt-", "essay-"];
    const readingPrefixes = ["rfib-", "rfib2-", "rmcq-", "rscq-", "rop-"];
    const listeningPrefixes = ["sst-", "hcs-", "lfib-", "lmcq-", "mmc-", "hiw-", "wfd-", "smc-", "smw-"];
    const inferSection = (taskId: string) => {
      if (speakingPrefixes.some(p => taskId.startsWith(p))) return "speaking";
      if (writingPrefixes.some(p => taskId.startsWith(p))) return "writing";
      if (readingPrefixes.some(p => taskId.startsWith(p))) return "reading";
      if (listeningPrefixes.some(p => taskId.startsWith(p))) return "listening";
      return "other";
    };
    const sectionAttempts: Record<string, number> = { speaking: 0, writing: 0, reading: 0, listening: 0, other: 0 };
    const sectionScoreSum: Record<string, number> = { speaking: 0, writing: 0, reading: 0, listening: 0, other: 0 };
    let totalAttempts = 0;
    let tasksPracticed = 0;
    const topTasks: { taskId: string; attempts: number; avgScore: number }[] = [];

    for (const [taskId, attempts] of Object.entries(scores)) {
      if (!Array.isArray(attempts) || attempts.length === 0) continue;
      const section = inferSection(taskId);
      sectionAttempts[section] += attempts.length;
      const validScores = attempts.filter((s): s is number => typeof s === 'number');
      sectionScoreSum[section] += validScores.reduce((a, b) => a + b, 0);
      totalAttempts += attempts.length;
      tasksPracticed++;
      topTasks.push({ taskId, attempts: attempts.length, avgScore: validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0 });
    }
    topTasks.sort((a, b) => b.attempts - a.attempts);

    const sectionAvgScore: Record<string, number> = {};
    for (const s of Object.keys(sectionAttempts)) {
      sectionAvgScore[s] = sectionAttempts[s] > 0 ? Math.round(sectionScoreSum[s] / sectionAttempts[s]) : 0;
    }

    return { totalAttempts, tasksPracticed, sectionAttempts, sectionAvgScore, topTasks: topTasks.slice(0, 5) };
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-app-bg/95 backdrop-blur-xl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-6xl h-[90vh] bg-app-surface border border-app-primary/20 rounded-3xl flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="p-5 border-b border-app-primary/10 flex items-center justify-between bg-app-surface/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-app-primary/10 rounded-xl flex items-center justify-center text-app-primary">
              <Shield size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-app-text">Admin Dashboard</h2>
              <p className="text-xs text-app-text-muted">Analytics · Users · Promotions · API Health</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-app-primary/10 rounded-xl text-app-text-muted transition-colors"
          >
            <XCircle size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-app-primary/10 px-4 shrink-0 overflow-x-auto">
          {([
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'promoCodes', label: 'Promo Codes', icon: Ticket },
            { id: 'apiKeys', label: 'API Keys', icon: Key },
          ] as const).map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-5 py-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap shrink-0",
                activeTab === tab.id ? "border-app-primary text-app-primary" : "border-transparent text-app-text-muted hover:text-app-text"
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && (activeTab !== 'apiKeys') ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
              <Loader2 className="animate-spin text-app-primary" size={40} />
              <p className="text-app-text-muted animate-pulse">Loading data...</p>
            </div>
          ) : (
            <>
              {/* ── ANALYTICS TAB ── */}
              {activeTab === 'analytics' && analytics && (
                <div className="space-y-6">
                  {/* Refresh + last update */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-app-text">Engagement Overview</h3>
                    <button
                      onClick={() => { hasFetchedAnalytics.current = false; fetchAnalytics(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-app-bg border border-app-primary/10 rounded-xl text-app-text-muted hover:text-app-primary hover:border-app-primary/30 transition-all"
                    >
                      <RefreshCw size={13} /> Refresh
                    </button>
                  </div>

                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Total Users', value: analytics.users.totalUsers, icon: Users2, color: 'text-app-primary', bg: 'bg-app-primary/10' },
                      { label: 'Paid Subscribers', value: analytics.users.paidUsers, icon: CreditCard, color: 'text-green-400', bg: 'bg-green-400/10' },
                      { label: 'Total Visits', value: analytics.visitors.totalVisits.toLocaleString(), icon: Globe, color: 'text-blue-400', bg: 'bg-blue-400/10' },
                      { label: 'Support Tickets', value: analytics.support.totalTickets, icon: MessageSquare, color: 'text-orange-400', bg: 'bg-orange-400/10' },
                    ].map(kpi => (
                      <div key={kpi.label} className="bg-app-bg border border-app-primary/10 rounded-2xl p-4 flex flex-col gap-2">
                        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', kpi.bg)}>
                          <kpi.icon size={16} className={kpi.color} />
                        </div>
                        <div className="text-2xl font-black text-app-text">{kpi.value}</div>
                        <div className="text-[10px] font-bold text-app-text-muted uppercase tracking-wider">{kpi.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Row 2: User Funnel + Visitor Trend */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* User Funnel */}
                    <div className="bg-app-bg border border-app-primary/10 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp size={16} className="text-app-primary" />
                        <h4 className="text-sm font-bold text-app-text">User Funnel</h4>
                      </div>
                      <div className="space-y-3">
                        {[
                          { label: 'Total Users', value: analytics.users.totalUsers, color: 'bg-app-primary' },
                          { label: 'Paid Active', value: analytics.users.paidUsers, color: 'bg-green-400' },
                          { label: 'Trial Users', value: analytics.users.trialUsers, color: 'bg-blue-400' },
                          { label: 'Guest Users', value: analytics.users.guestUsers, color: 'bg-gray-400' },
                        ].map(item => (
                          <div key={item.label} className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-app-text">{item.label}</span>
                              <span className="text-xs font-black text-app-text">{item.value}</span>
                            </div>
                            <MiniBar value={item.value} max={analytics.users.totalUsers} color={item.color} />
                          </div>
                        ))}
                      </div>
                      {/* Plan breakdown */}
                      {Object.keys(analytics.users.planCounts).length > 0 && (
                        <div className="pt-3 border-t border-app-primary/10">
                          <p className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest mb-2">Active Plan Distribution</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(analytics.users.planCounts).map(([plan, count]) => (
                              <div key={plan} className="flex items-center gap-1.5 px-2.5 py-1 bg-app-surface rounded-lg border border-app-primary/10">
                                <span className="text-[11px] font-bold text-app-text capitalize">{plan}</span>
                                <span className="text-[11px] font-black text-app-primary">{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Visitor Trend (7 days) */}
                    <div className="bg-app-bg border border-app-primary/10 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <Activity size={16} className="text-app-primary" />
                        <h4 className="text-sm font-bold text-app-text">Visitor Trend (7 Days)</h4>
                      </div>
                      <div className="flex items-end gap-1 h-20">
                        {Object.entries(analytics.visitors.dailyVisits).map(([date, count]) => {
                          const max = Math.max(...Object.values(analytics.visitors.dailyVisits), 1);
                          return <VisitorBar key={date} label={date} value={count} max={max} />;
                        })}
                      </div>
                      {/* Signups trend */}
                      <div className="pt-3 border-t border-app-primary/10">
                        <p className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest mb-2">New Signups (7 Days)</p>
                        <div className="flex items-end gap-1 h-12">
                          {Object.entries(analytics.users.signupsByDay).map(([date, count]) => {
                            const max = Math.max(...Object.values(analytics.users.signupsByDay), 1);
                            const pct = max > 0 ? Math.round((count / max) * 100) : 0;
                            return (
                              <div key={date} className="flex flex-col items-center gap-0.5 flex-1">
                                <div className="w-full flex flex-col justify-end" style={{ height: 36 }}>
                                  <div className="w-full bg-app-accent/60 rounded-t" style={{ height: `${Math.max(pct, count > 0 ? 8 : 0)}%` }} />
                                </div>
                                <div className="text-[8px] text-app-text-muted">{date.length >= 10 ? date.slice(8) : date}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Section Usage + Top Practiced Tasks */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Section Usage */}
                    <div className="bg-app-bg border border-app-primary/10 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <BarChart3 size={16} className="text-app-primary" />
                        <h4 className="text-sm font-bold text-app-text">Practice by Section</h4>
                      </div>
                      <div className="space-y-4">
                        {(Object.entries(analytics.tasks.sectionCounts) as [string, number][]).map(([section, count]) => {
                          const meta = SECTION_META[section as keyof typeof SECTION_META];
                          const total = Object.values(analytics.tasks.sectionCounts).reduce((a, b) => a + b, 0);
                          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                          if (!meta) return null;
                          const SectionIcon = meta.icon;
                          return (
                            <div key={section} className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center', meta.bg)}>
                                    <SectionIcon size={12} className={meta.color} />
                                  </div>
                                  <span className="text-xs font-bold text-app-text capitalize">{section}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-app-text-muted">{count.toLocaleString()} attempts</span>
                                  <span className="text-xs font-black text-app-text">{pct}%</span>
                                </div>
                              </div>
                              <div className="h-2 bg-app-primary/10 rounded-full overflow-hidden">
                                <div className={cn('h-full rounded-full transition-all duration-700', meta.bar)} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                        {Object.values(analytics.tasks.sectionCounts).every(v => v === 0) && (
                          <p className="text-xs text-app-text-muted text-center py-4">No practice data yet</p>
                        )}
                      </div>
                    </div>

                    {/* Top Practiced Tasks */}
                    <div className="bg-app-bg border border-app-primary/10 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <Zap size={16} className="text-app-primary" />
                        <h4 className="text-sm font-bold text-app-text">Most Practiced Tasks</h4>
                      </div>
                      <div className="space-y-2">
                        {analytics.tasks.topTasks.length === 0 ? (
                          <p className="text-xs text-app-text-muted text-center py-4">No task data yet</p>
                        ) : analytics.tasks.topTasks.map((task, i) => {
                          const maxCount = analytics.tasks.topTasks[0]?.count ?? 1;
                          const taskLabel = TASK_CATEGORY_MAP[task.taskId] ?? task.taskId;
                          const pct = maxCount > 0 ? Math.round((task.count / maxCount) * 100) : 0;
                          return (
                            <div key={task.taskId} className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-app-text-muted w-4 text-right">{i + 1}</span>
                              <div className="flex-1 space-y-0.5">
                                <div className="flex justify-between">
                                  <span className="text-xs font-bold text-app-text truncate max-w-[160px]">{taskLabel}</span>
                                  <span className="text-xs font-black text-app-primary ml-2">{task.count}</span>
                                </div>
                                <div className="h-1.5 bg-app-primary/10 rounded-full overflow-hidden">
                                  <div className="h-full bg-app-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Row 4: Support Topics + Ticket Categories */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Support Chat Topics */}
                    <div className="bg-app-bg border border-app-primary/10 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <MessageSquare size={16} className="text-app-primary" />
                        <h4 className="text-sm font-bold text-app-text">Support Chat Topics</h4>
                        <span className="text-[10px] text-app-text-muted">(issue type on chat start)</span>
                      </div>
                      <div className="space-y-2">
                        {Object.keys(analytics.support.topics).length === 0 ? (
                          <p className="text-xs text-app-text-muted text-center py-4">No chat data yet</p>
                        ) : (() => {
                          const topicEntries = Object.entries(analytics.support.topics)
                            .filter(([, v]) => typeof v === 'number')
                            .sort(([, a], [, b]) => (b as number) - (a as number));
                          const maxVal = (topicEntries[0]?.[1] as number) ?? 1;
                          return topicEntries.map(([topic, count]) => (
                            <div key={topic} className="flex items-center gap-2">
                              <div className="flex-1 space-y-0.5">
                                <div className="flex justify-between">
                                  <span className="text-xs font-bold text-app-text truncate max-w-[180px]">{topic}</span>
                                  <span className="text-xs font-black text-app-primary">{count as number}</span>
                                </div>
                                <div className="h-1.5 bg-app-primary/10 rounded-full overflow-hidden">
                                  <div className="h-full bg-app-accent/70 rounded-full" style={{ width: `${Math.round(((count as number) / maxVal) * 100)}%` }} />
                                </div>
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                    {/* Support Ticket Categories */}
                    <div className="bg-app-bg border border-app-primary/10 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <Ticket size={16} className="text-app-primary" />
                        <h4 className="text-sm font-bold text-app-text">Support Ticket Categories</h4>
                      </div>
                      <div className="text-2xl font-black text-app-text mb-1">{analytics.support.totalTickets} <span className="text-sm font-bold text-app-text-muted">total tickets</span></div>
                      <div className="space-y-2">
                        {Object.keys(analytics.support.ticketCategories).length === 0 ? (
                          <p className="text-xs text-app-text-muted text-center py-2">No ticket data yet</p>
                        ) : (() => {
                          const catEntries = Object.entries(analytics.support.ticketCategories)
                            .sort(([, a], [, b]) => b - a);
                          const maxVal = catEntries[0]?.[1] ?? 1;
                          return catEntries.map(([cat, count]) => (
                            <div key={cat} className="flex items-center gap-2">
                              <div className="flex-1 space-y-0.5">
                                <div className="flex justify-between">
                                  <span className="text-xs font-bold text-app-text truncate max-w-[180px]">{cat}</span>
                                  <span className="text-xs font-black text-orange-400">{count}</span>
                                </div>
                                <div className="h-1.5 bg-orange-400/10 rounded-full overflow-hidden">
                                  <div className="h-full bg-orange-400/70 rounded-full" style={{ width: `${Math.round((count / maxVal) * 100)}%` }} />
                                </div>
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── USERS TAB ── */}
              {activeTab === 'users' && (
                <>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div className="relative max-w-md flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                      <input 
                        type="text" 
                        placeholder="Search users by email or name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-app-bg border border-app-primary/10 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-app-primary transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 bg-app-bg p-1 rounded-xl border border-app-primary/10">
                        <button 
                          onClick={() => setUserFilter('all')}
                          className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all", userFilter === 'all' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text")}
                        >
                          All ({users.length})
                        </button>
                        <button 
                          onClick={() => setUserFilter('paid')}
                          className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all", userFilter === 'paid' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text")}
                        >
                          Paid ({paidCount})
                        </button>
                        <button 
                          onClick={() => setUserFilter('guests')}
                          className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all", userFilter === 'guests' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text")}
                        >
                          Guests ({guestCount})
                        </button>
                      </div>
                      <button
                        onClick={() => fetchData(true)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-app-bg border border-app-primary/10 rounded-xl text-app-text-muted hover:text-app-primary hover:border-app-primary/30 transition-all"
                        title="Refresh user list"
                      >
                        <RefreshCw size={14} />
                        Refresh
                      </button>
                      {guestCount > 0 && (
                        <button
                          onClick={handlePurgeStaleGuests}
                          disabled={isPurgingGuests}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-app-bg border border-red-500/20 rounded-xl text-red-400 hover:text-red-500 hover:border-red-500/40 transition-all disabled:opacity-50"
                          title="Delete anonymous guest sessions older than 3 days"
                        >
                          {isPurgingGuests ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          Purge stale guests
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-app-text-muted text-xs uppercase tracking-wider border-b border-app-primary/10">
                          <th className="px-4 py-3 font-bold">User</th>
                          <th className="px-4 py-3 font-bold">Status</th>
                          <th className="px-4 py-3 font-bold">Plan</th>
                          <th className="px-4 py-3 font-bold">Joined</th>
                          <th className="px-4 py-3 font-bold">Role</th>
                          <th className="px-4 py-3 font-bold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-app-primary/5">
                        {filteredUsers.map((user) => (
                          <tr key={user.uid} className="hover:bg-app-primary/5 transition-colors">
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-app-primary/10 rounded-full flex items-center justify-center text-app-primary">
                                  <UserIcon size={16} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <div className="text-sm font-bold text-app-text">{user.displayName || 'Anonymous'}</div>
                                    {user.accessType === 'guest' && (
                                      <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 text-[8px] font-black uppercase tracking-tighter border border-gray-200 dark:border-gray-700">Guest</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-app-text-muted">{user.email || 'No email provided'}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className={cn("px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                user.subscriptionStatus === 'active' ? "bg-green-500/10 text-green-500" : 
                                user.subscriptionStatus === 'expired' ? "bg-red-500/10 text-red-500" : "bg-app-primary/10 text-app-primary"
                              )}>
                                {user.subscriptionStatus}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2 text-xs text-app-text capitalize">
                                <CreditCard size={14} className="text-app-text-muted" />
                                {user.planId ? (SUBSCRIPTION_PLANS.find(p => p.id === user.planId)?.name || user.planId) : 'No Plan'}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2 text-xs text-app-text-muted">
                                <Clock size={14} />
                                {new Date(user.createdAt).toLocaleDateString()}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <span className={cn("px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                  user.role === 'admin' ? "bg-purple-500/10 text-purple-500" : "bg-app-text-muted/10 text-app-text-muted"
                                )}>
                                  {user.role || 'user'}
                                </span>
                                <button
                                  onClick={() => handleRoleChange(user, user.role === 'admin' ? 'user' : 'admin')}
                                  disabled={roleChangingUid === user.uid}
                                  className={cn("p-1 rounded-lg transition-all text-[10px]",
                                    user.role === 'admin'
                                      ? "bg-purple-500/10 text-purple-500 hover:bg-purple-500/20"
                                      : "bg-app-text-muted/10 text-app-text-muted hover:bg-purple-500/10 hover:text-purple-500"
                                  )}
                                  title={user.role === 'admin' ? 'Remove admin role' : 'Make admin'}
                                >
                                  {roleChangingUid === user.uid
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <ShieldCheck size={12} />}
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setSelectedUser(user)}
                                  className="p-2 rounded-xl bg-app-primary/10 text-app-primary hover:bg-app-primary/20 transition-all"
                                  title="View user details"
                                >
                                  <Eye size={16} />
                                </button>
                                <button
                                  onClick={() => setUserToDelete(user)}
                                  className="p-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                                  title="Delete user"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* ── PROMO CODES TAB ── */}
              {activeTab === 'promoCodes' && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-app-text">Manage Promo Codes</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => fetchData(true)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-app-bg border border-app-primary/10 rounded-xl text-app-text-muted hover:text-app-primary hover:border-app-primary/30 transition-all"
                        title="Refresh promo codes"
                      >
                        <RefreshCw size={14} /> Refresh
                      </button>
                      <button 
                        onClick={() => setIsAddingPromo(true)}
                        className="flex items-center gap-2 bg-app-primary text-app-bg px-4 py-2 rounded-xl text-sm font-bold hover:bg-app-accent transition-all"
                      >
                        <Plus size={18} /> Add New Code
                      </button>
                    </div>
                  </div>

                  {isAddingPromo && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-app-bg border border-app-primary/20 rounded-2xl p-6 space-y-4 mb-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs text-app-text-muted font-bold uppercase">Code</label>
                          <input 
                            type="text" 
                            value={newPromo.code}
                            onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })}
                            placeholder="e.g. SUMMER50"
                            className="w-full bg-app-surface border border-app-primary/10 rounded-xl px-4 py-2 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-app-text-muted font-bold uppercase">Discount %</label>
                          <input 
                            type="number" 
                            value={newPromo.discountPercent}
                            onChange={(e) => setNewPromo({ ...newPromo, discountPercent: parseInt(e.target.value) })}
                            className="w-full bg-app-surface border border-app-primary/10 rounded-xl px-4 py-2 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-app-text-muted font-bold uppercase">Description</label>
                          <input 
                            type="text" 
                            value={newPromo.description}
                            onChange={(e) => setNewPromo({ ...newPromo, description: e.target.value })}
                            placeholder="e.g. 50% off summer sale"
                            className="w-full bg-app-surface border border-app-primary/10 rounded-xl px-4 py-2 text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3">
                        <button 
                          onClick={() => setIsAddingPromo(false)}
                          className="px-4 py-2 text-sm font-bold text-app-text-muted hover:text-app-text"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={handleAddPromo}
                          className="bg-app-primary text-app-bg px-6 py-2 rounded-xl text-sm font-bold"
                        >
                          Create Code
                        </button>
                      </div>
                    </motion.div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {promoCodes.map((promo) => (
                      <div key={promo.code} className="bg-app-bg border border-app-primary/10 rounded-2xl p-6 flex flex-col space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Ticket className="text-app-primary" size={20} />
                            <span className="text-lg font-bold text-app-text">{promo.code}</span>
                          </div>
                          <button 
                            onClick={() => togglePromoStatus(promo)}
                            className={cn("p-2 rounded-xl transition-all", promo.isActive ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500")}
                          >
                            {promo.isActive ? <CheckCircle size={20} /> : <XCircle size={20} />}
                          </button>
                        </div>
                        <div className="space-y-1">
                          <div className="text-2xl font-bold text-app-accent">{promo.discountPercent}% OFF</div>
                          <p className="text-xs text-app-text-muted">{promo.description}</p>
                        </div>
                        <div className="pt-4 border-t border-app-primary/5 flex items-center justify-between">
                          <span className={cn("text-[10px] font-bold uppercase tracking-widest", promo.isActive ? "text-green-500" : "text-red-500")}>
                            {promo.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ── API KEYS TAB ── */}
              {activeTab === 'apiKeys' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-app-text">AI API Key Health</h3>
                      <p className="text-xs text-app-text-muted mt-0.5">Monitor quota and token usage across all configured API keys</p>
                    </div>
                    <button
                      onClick={fetchGeminiStatus}
                      disabled={geminiRefreshing}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-app-bg border border-app-primary/10 rounded-xl text-app-text-muted hover:text-app-primary hover:border-app-primary/30 transition-all disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={geminiRefreshing ? 'animate-spin' : ''} />
                      {geminiRefreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                  </div>

                  {!geminiStatus && !geminiRefreshing ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3">
                      <Key size={32} className="text-app-text-muted opacity-40" />
                      <button onClick={fetchGeminiStatus} className="text-app-primary text-sm font-bold hover:underline">
                        Load Key Status
                      </button>
                    </div>
                  ) : geminiRefreshing && !geminiStatus ? (
                    <div className="flex items-center justify-center h-48">
                      <Loader2 className="animate-spin text-app-primary" size={32} />
                    </div>
                  ) : geminiStatus && (
                    <>
                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Text Keys Total', value: geminiStatus.totalKeys, icon: Key, color: 'text-app-primary', bg: 'bg-app-primary/10' },
                          { label: 'Text Keys Available', value: geminiStatus.availableKeys, icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-400/10' },
                          { label: 'TTS Keys Total', value: geminiStatus.tts.keys.length, icon: Key, color: 'text-blue-400', bg: 'bg-blue-400/10' },
                          { label: 'TTS Keys Available', value: geminiStatus.tts.availableKeys, icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-400/10' },
                        ].map(card => (
                          <div key={card.label} className="bg-app-bg border border-app-primary/10 rounded-2xl p-4 flex flex-col gap-2">
                            <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', card.bg)}>
                              <card.icon size={16} className={card.color} />
                            </div>
                            <div className="text-2xl font-black text-app-text">{card.value}</div>
                            <div className="text-[10px] font-bold text-app-text-muted uppercase tracking-wider">{card.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* ── Daily Token Usage ── */}
                      {(() => {
                        const formatTokens = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);
                        const today = new Date().toISOString().slice(0, 10);
                        // Show last 7 days descending
                        const days = Object.keys(geminiStatus.dailyTokens).sort((a, b) => b.localeCompare(a)).slice(0, 7);
                        if (days.length === 0) return null;
                        const todayData = geminiStatus.dailyTokens[today];
                        return (
                          <div className="bg-app-bg border border-app-primary/10 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2">
                              <Hash size={16} className="text-app-primary" />
                              <h4 className="text-sm font-bold text-app-text">Token Usage (Daily Totals)</h4>
                              <span className="text-[10px] text-app-text-muted ml-auto">Persisted across restarts</span>
                            </div>
                            {/* Today highlight */}
                            {todayData && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {[
                                  { label: "Today Text In", value: todayData.textInput, color: 'text-blue-400', bg: 'bg-blue-400/5 border-blue-400/20' },
                                  { label: "Today Text Out", value: todayData.textOutput, color: 'text-purple-400', bg: 'bg-purple-400/5 border-purple-400/20' },
                                  { label: "Today TTS In", value: todayData.ttsInput, color: 'text-green-400', bg: 'bg-green-400/5 border-green-400/20' },
                                  { label: "Today TTS Out", value: todayData.ttsOutput, color: 'text-orange-400', bg: 'bg-orange-400/5 border-orange-400/20' },
                                ].map(item => (
                                  <div key={item.label} className={cn("border rounded-xl p-3 text-center", item.bg)}>
                                    <div className={cn("text-lg font-black", item.color)}>{formatTokens(item.value)}</div>
                                    <div className="text-[9px] font-bold text-app-text-muted uppercase tracking-wide mt-0.5">{item.label}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Per-day table */}
                            <div className="space-y-1.5">
                              {days.map(day => {
                                const d = geminiStatus.dailyTokens[day];
                                const totalText = d.textInput + d.textOutput;
                                const totalTTS = d.ttsInput + d.ttsOutput;
                                const isToday = day === today;
                                return (
                                  <div key={day} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-xs", isToday ? "bg-app-primary/10" : "bg-app-primary/5")}>
                                    <span className={cn("font-bold w-24 shrink-0", isToday ? "text-app-primary" : "text-app-text-muted")}>{day}{isToday ? ' (today)' : ''}</span>
                                    <div className="flex gap-3 flex-wrap">
                                      <span className="text-app-text-muted">Text: <span className="font-black text-app-text">{formatTokens(totalText)}</span> <span className="text-[10px]">(↑{formatTokens(d.textInput)} ↓{formatTokens(d.textOutput)})</span></span>
                                      <span className="text-app-text-muted">TTS: <span className="font-black text-app-text">{formatTokens(totalTTS)}</span> <span className="text-[10px]">(↑{formatTokens(d.ttsInput)} ↓{formatTokens(d.ttsOutput)})</span></span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── Text Keys — Vertex AI ── */}
                      {geminiStatus.vertexKeyCount > 0 && (() => {
                        const vertexKeys = geminiStatus.keys.filter(k => k.isVertex);
                        return (
                          <div className="bg-app-bg border border-purple-500/20 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Cpu size={16} className="text-purple-400" />
                              <h4 className="text-sm font-bold text-app-text">Text — Vertex AI Keys</h4>
                              <span className="text-[10px] text-app-text-muted">(analyze-speaking, analyze-writing, support-chat)</span>
                              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
                                {vertexKeys.filter(k => k.available).length}/{vertexKeys.length} available
                              </span>
                            </div>
                            {geminiStatus.lastSyncedAt && (
                              <p className="text-[10px] text-app-text-muted">Last synced: {new Date(geminiStatus.lastSyncedAt).toLocaleTimeString()}</p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {vertexKeys.map((key, idx) => (
                                <KeyCard key={key.index} keyData={key} prefix="Vertex Key" positionIndex={idx} />
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── Text Keys — Gemini Developer API ── */}
                      {geminiStatus.geminiKeyCount > 0 && (() => {
                        const devKeys = geminiStatus.keys.filter(k => !k.isVertex);
                        return (
                          <div className="bg-app-bg border border-app-primary/10 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Key size={16} className="text-app-primary" />
                              <h4 className="text-sm font-bold text-app-text">Text — Gemini Developer API Keys</h4>
                              <span className="text-[10px] text-app-text-muted">(analyze-speaking, analyze-writing, support-chat)</span>
                              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-app-primary/10 text-app-primary">
                                {devKeys.filter(k => k.available).length}/{devKeys.length} available
                              </span>
                            </div>
                            {geminiStatus.lastSyncedAt && (
                              <p className="text-[10px] text-app-text-muted">Last synced: {new Date(geminiStatus.lastSyncedAt).toLocaleTimeString()}</p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {devKeys.map((key, idx) => (
                                <KeyCard key={key.index} keyData={key} prefix="Key" positionIndex={idx} />
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── TTS Keys — Vertex AI ── */}
                      {geminiStatus.tts.vertexKeyCount > 0 && (() => {
                        const vertexTTSKeys = geminiStatus.tts.keys.filter(k => k.isVertex);
                        return (
                          <div className="bg-app-bg border border-purple-500/20 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Cpu size={16} className="text-purple-400" />
                              <h4 className="text-sm font-bold text-app-text">TTS — Vertex AI Keys</h4>
                              <span className="text-[10px] text-app-text-muted">(generate-tts endpoint)</span>
                              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
                                {vertexTTSKeys.filter(k => k.available).length}/{vertexTTSKeys.length} available
                              </span>
                            </div>
                            {geminiStatus.tts.lastSyncedAt && (
                              <p className="text-[10px] text-app-text-muted">Last synced: {new Date(geminiStatus.tts.lastSyncedAt).toLocaleTimeString()}</p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {vertexTTSKeys.map((key, idx) => (
                                <KeyCard key={key.index} keyData={key} prefix="TTS Vertex Key" positionIndex={idx} />
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── TTS Keys — Gemini Developer API ── */}
                      {geminiStatus.tts.geminiKeyCount > 0 && (() => {
                        const devTTSKeys = geminiStatus.tts.keys.filter(k => !k.isVertex);
                        return (
                          <div className="bg-app-bg border border-blue-400/20 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Key size={16} className="text-blue-400" />
                              <h4 className="text-sm font-bold text-app-text">TTS — Gemini Developer API Keys</h4>
                              <span className="text-[10px] text-app-text-muted">(generate-tts endpoint)</span>
                              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400">
                                {devTTSKeys.filter(k => k.available).length}/{devTTSKeys.length} available
                              </span>
                            </div>
                            {geminiStatus.tts.lastSyncedAt && (
                              <p className="text-[10px] text-app-text-muted">Last synced: {new Date(geminiStatus.tts.lastSyncedAt).toLocaleTimeString()}</p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {devTTSKeys.map((key, idx) => (
                                <KeyCard key={key.index} keyData={key} prefix="TTS Key" positionIndex={idx} />
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      <p className="text-[10px] text-app-text-muted text-center">
                        ⚠️ Per-key call counts reset on server restart. Daily token totals persist via Firestore. Vertex AI keys are prioritised over Gemini Developer API keys.
                      </p>

                      {/* ── No Vertex AI keys warning ── */}
                      {geminiStatus.vertexKeyCount === 0 && (
                        <div className="bg-orange-400/5 border border-orange-400/30 rounded-xl p-4 text-[11px] text-orange-300 space-y-1">
                          <p className="font-bold">⚠ No Vertex AI keys detected</p>
                          <p>All requests are currently served by Gemini Developer API keys. To enable Vertex AI as the primary provider, set one of these environment variables in your Vercel project settings:</p>
                          <ul className="list-disc list-inside space-y-0.5 mt-1">
                            <li><code className="bg-app-bg px-1 rounded">VERTEX_AI_API_KEY</code> — Vertex AI Express Mode API key (simplest option)</li>
                            <li><code className="bg-app-bg px-1 rounded">VERTEX_AI_SERVICE_ACCOUNT_JSON</code> — full service account JSON + optional <code className="bg-app-bg px-1 rounded">VERTEX_AI_LOCATION</code></li>
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-app-surface border border-red-500/20 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-500">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-app-text">Delete User</h3>
                <p className="text-xs text-app-text-muted">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-app-text">
              Are you sure you want to delete{' '}
              <span className="font-bold">{userToDelete.displayName || userToDelete.email || userToDelete.uid}</span>?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setUserToDelete(null)}
                disabled={isDeletingUser}
                className="px-4 py-2 text-sm font-bold text-app-text-muted hover:text-app-text disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={isDeletingUser}
                className="flex items-center gap-2 bg-red-500 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-red-600 transition-all disabled:opacity-50"
              >
                {isDeletingUser ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── User Detail Modal ── */}
      {selectedUser && (() => {
        const stats = getUserEngagementStats(selectedUser);
        const sectionMeta = {
          speaking: { icon: Mic, color: 'text-blue-400', bg: 'bg-blue-400/10', bar: 'bg-blue-400' },
          writing: { icon: PenTool, color: 'text-purple-400', bg: 'bg-purple-400/10', bar: 'bg-purple-400' },
          reading: { icon: BookOpen, color: 'text-green-400', bg: 'bg-green-400/10', bar: 'bg-green-400' },
          listening: { icon: Headphones, color: 'text-orange-400', bg: 'bg-orange-400/10', bar: 'bg-orange-400' },
        } as const;
        const maxSectionAttempts = Math.max(...Object.values(stats.sectionAttempts), 1);
        const plan = selectedUser.planId ? (SUBSCRIPTION_PLANS.find(p => p.id === selectedUser.planId)?.name ?? selectedUser.planId) : 'No Plan';
        return (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-app-surface border border-app-primary/20 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="p-5 border-b border-app-primary/10 flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-2 hover:bg-app-primary/10 rounded-xl text-app-text-muted transition-colors"
                  title="Back to users"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="w-10 h-10 bg-app-primary/10 rounded-xl flex items-center justify-center text-app-primary shrink-0">
                  <UserIcon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-app-text truncate">{selectedUser.displayName || 'Anonymous'}</h3>
                    {selectedUser.role === 'admin' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-500 uppercase">Admin</span>
                    )}
                    {selectedUser.accessType === 'guest' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-500/10 text-gray-400 uppercase">Guest</span>
                    )}
                  </div>
                  <p className="text-xs text-app-text-muted truncate">{selectedUser.email || 'No email'}</p>
                </div>
                <button
                  onClick={() => { setSelectedUser(null); setUserToDelete(selectedUser); }}
                  className="p-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all shrink-0"
                  title="Delete this user"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="overflow-y-auto flex-1 p-5 space-y-5">
                {/* Account info */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { icon: CreditCard, label: 'Plan', value: plan, color: 'text-app-primary' },
                    { icon: Activity, label: 'Status', value: selectedUser.subscriptionStatus, color: selectedUser.subscriptionStatus === 'active' ? 'text-green-400' : 'text-app-text-muted' },
                    { icon: Calendar, label: 'Joined', value: new Date(selectedUser.createdAt).toLocaleDateString(), color: 'text-app-text-muted' },
                    { icon: Hash, label: 'UID', value: selectedUser.uid.slice(0, 8) + '…', color: 'text-app-text-muted' },
                    ...(selectedUser.targetScore ? [{ icon: Target, label: 'Target Score', value: String(selectedUser.targetScore), color: 'text-orange-400' }] : []),
                    ...(selectedUser.testDate ? [{ icon: Clock, label: 'Test Date', value: new Date(selectedUser.testDate).toLocaleDateString(), color: 'text-blue-400' }] : []),
                  ].map(item => (
                    <div key={item.label} className="bg-app-bg border border-app-primary/10 rounded-xl p-3 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <item.icon size={12} className={item.color} />
                        <span className="text-[10px] text-app-text-muted uppercase font-bold tracking-wide">{item.label}</span>
                      </div>
                      <span className="text-sm font-bold text-app-text capitalize">{item.value}</span>
                    </div>
                  ))}
                </div>

                {/* Manual Subscription Override */}
                <div className="bg-orange-400/5 border border-orange-400/20 rounded-2xl p-5 space-y-4">
                  <h4 className="text-xs font-bold text-orange-400 uppercase tracking-wider flex items-center gap-2">
                    <Shield size={13} /> Manage Subscription (Admin)
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] text-app-text-muted font-bold uppercase">Status</label>
                      <select
                        value={overrideStatus}
                        onChange={(e) => setOverrideStatus(e.target.value as UserData['subscriptionStatus'])}
                        className="w-full bg-app-surface border border-app-primary/10 rounded-xl px-3 py-2 text-sm focus:border-orange-400 transition-all"
                      >
                        <option value="inactive">Inactive</option>
                        <option value="active">Active</option>
                        <option value="trial">Trial</option>
                        <option value="guest">Guest</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-app-text-muted font-bold uppercase">Plan</label>
                      <select
                        value={overridePlan}
                        onChange={(e) => setOverridePlan(e.target.value)}
                        className="w-full bg-app-surface border border-app-primary/10 rounded-xl px-3 py-2 text-sm focus:border-orange-400 transition-all"
                      >
                        <option value="">No Plan</option>
                        {SUBSCRIPTION_PLANS.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] text-app-text-muted font-bold uppercase">Expiration Date</label>
                      <input
                        type="date"
                        value={overrideEndsAt}
                        onChange={(e) => setOverrideEndsAt(e.target.value)}
                        className="w-full bg-app-surface border border-app-primary/10 rounded-xl px-3 py-2 text-sm focus:border-orange-400 transition-all"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => setShowOverrideConfirm(true)}
                    className="w-full bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={14} />
                    Update Subscription
                  </button>
                </div>

                {/* Usage summary */}
                <div>
                  <h4 className="text-xs font-bold text-app-text uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Zap size={13} className="text-app-primary" /> Usage &amp; Engagement
                  </h4>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-app-primary/5 border border-app-primary/10 rounded-xl p-3 text-center">
                      <div className="text-2xl font-black text-app-text">{stats.totalAttempts}</div>
                      <div className="text-[10px] text-app-text-muted uppercase font-bold mt-0.5">Total Practice Attempts</div>
                    </div>
                    <div className="bg-app-primary/5 border border-app-primary/10 rounded-xl p-3 text-center">
                      <div className="text-2xl font-black text-app-text">{stats.tasksPracticed}</div>
                      <div className="text-[10px] text-app-text-muted uppercase font-bold mt-0.5">Unique Tasks Practiced</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-app-primary/5 border border-app-primary/10 rounded-xl p-3 text-center">
                      <div className="text-2xl font-black text-app-text">{selectedUser.completedTasks?.length ?? 0}</div>
                      <div className="text-[10px] text-app-text-muted uppercase font-bold mt-0.5">Completed Tasks</div>
                    </div>
                    <div className="bg-app-primary/5 border border-app-primary/10 rounded-xl p-3 text-center">
                      <div className="text-2xl font-black text-app-text">{selectedUser.mockTestResults?.length ?? 0}</div>
                      <div className="text-[10px] text-app-text-muted uppercase font-bold mt-0.5">Mock Tests Taken</div>
                    </div>
                  </div>
                </div>

                {/* Section breakdown */}
                {stats.totalAttempts > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-app-text uppercase tracking-wider mb-3 flex items-center gap-2">
                      <BarChart3 size={13} className="text-app-primary" /> Section Breakdown
                    </h4>
                    <div className="space-y-2">
                      {(Object.keys(sectionMeta) as Array<keyof typeof sectionMeta>).map(section => {
                        const meta = sectionMeta[section];
                        const attempts = stats.sectionAttempts[section] ?? 0;
                        const avgScore = stats.sectionAvgScore[section] ?? 0;
                        const pct = Math.round((attempts / maxSectionAttempts) * 100);
                        return (
                          <div key={section} className="flex items-center gap-3">
                            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', meta.bg)}>
                              <meta.icon size={13} className={meta.color} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-bold text-app-text capitalize">{section}</span>
                                <span className="text-[10px] text-app-text-muted">{attempts} attempts{avgScore > 0 ? ` · avg ${avgScore}` : ''}</span>
                              </div>
                              <div className="h-1.5 bg-app-primary/10 rounded-full overflow-hidden">
                                <div className={cn('h-full rounded-full transition-all', meta.bar)} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Top tasks */}
                {stats.topTasks.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-app-text uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Award size={13} className="text-app-primary" /> Most Practiced Tasks
                    </h4>
                    <div className="space-y-1.5">
                      {stats.topTasks.map((t, i) => (
                        <div key={t.taskId} className="flex items-center justify-between bg-app-bg border border-app-primary/10 rounded-xl px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-app-text-muted w-4">#{i + 1}</span>
                            <span className="text-xs font-bold text-app-text">{t.taskId}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-app-text-muted">
                            <span>{t.attempts} attempts</span>
                            {t.avgScore > 0 && <span className="text-app-primary font-bold">avg {t.avgScore}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {stats.totalAttempts === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-app-text-muted">
                    <Activity size={28} className="opacity-30" />
                    <p className="text-sm">No practice activity yet</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        );
      })()}

      {/* Subscription Override Confirmation Modal */}
      {showOverrideConfirm && selectedUser && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-app-surface border border-orange-500/20 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-400">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-app-text">Manual Override</h3>
                <p className="text-xs text-app-text-muted">Confirm subscription changes</p>
              </div>
            </div>
            <div className="text-sm text-app-text space-y-2">
              <p>You are about to manually override the subscription for <span className="font-bold">{selectedUser.displayName || selectedUser.email}</span>.</p>
              <div className="bg-app-bg/50 rounded-lg p-3 text-[11px] space-y-1 border border-app-primary/5">
                <div className="flex justify-between">
                  <span className="text-app-text-muted">New Status:</span>
                  <span className="font-bold text-orange-400 uppercase">{overrideStatus}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-app-text-muted">New Plan:</span>
                  <span className="font-bold">{SUBSCRIPTION_PLANS.find(p => p.id === overridePlan)?.name || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-app-text-muted">Ends At:</span>
                  <span className="font-bold">{overrideEndsAt || 'No expiration'}</span>
                </div>
              </div>
              <p className="text-[11px] text-app-text-muted italic">This will bypass the standard payment flow and create an audit log.</p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowOverrideConfirm(false)}
                disabled={isOverridingSubscription}
                className="px-4 py-2 text-sm font-bold text-app-text-muted hover:text-app-text disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSetSubscription}
                disabled={isOverridingSubscription}
                className="flex items-center gap-2 bg-orange-500 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-orange-600 transition-all disabled:opacity-50"
              >
                {isOverridingSubscription ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Confirm Changes
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

