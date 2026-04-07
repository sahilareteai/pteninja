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
  lastSyncedAt: number | null;
  keys: { index: number; available: boolean; exhaustedUntil: number | null; cooldownRemainingSeconds: number; consecutiveExhaustions: number }[];
  tts: {
    availableKeys: number;
    lastSyncedAt: number | null;
    keys: { index: number; available: boolean; exhaustedUntil: number | null; cooldownRemainingSeconds: number; consecutiveExhaustions: number }[];
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
  const [roleChangingUid, setRoleChangingUid] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<GeminiKeyStatus | null>(null);
  const [geminiRefreshing, setGeminiRefreshing] = useState(false);
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
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');
      const response = await fetch('/api/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ uid: userToDelete.uid }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? 'Failed to delete user');
      }
      setUsers(prev => prev.filter(u => u.uid !== userToDelete.uid));
      toast.success(`User ${userToDelete.displayName || userToDelete.email || userToDelete.uid} deleted`);
      setUserToDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete user');
      console.error('Delete user error:', error);
    } finally {
      setIsDeletingUser(false);
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
                              <button
                                onClick={() => setUserToDelete(user)}
                                className="p-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                                title="Delete user"
                              >
                                <Trash2 size={16} />
                              </button>
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
                      <h3 className="text-base font-bold text-app-text">Gemini API Key Health</h3>
                      <p className="text-xs text-app-text-muted mt-0.5">Monitor quota usage across all configured API keys</p>
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

                      {/* Text Keys */}
                      <div className="bg-app-bg border border-app-primary/10 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center gap-2">
                          <Key size={16} className="text-app-primary" />
                          <h4 className="text-sm font-bold text-app-text">Text API Keys</h4>
                          <span className="text-[10px] text-app-text-muted">(analyze-speaking, analyze-writing, support-chat)</span>
                        </div>
                        {geminiStatus.lastSyncedAt && (
                          <p className="text-[10px] text-app-text-muted">Last synced: {new Date(geminiStatus.lastSyncedAt).toLocaleTimeString()}</p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {geminiStatus.keys.map(key => (
                            <div key={key.index} className={cn(
                              "border rounded-xl p-4 space-y-2",
                              key.available ? "border-green-400/30 bg-green-400/5" : "border-red-400/30 bg-red-400/5"
                            )}>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-app-text">Key #{key.index + 1}</span>
                                <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold',
                                  key.available ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                                )}>
                                  {key.available ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                                  {key.available ? 'Available' : 'Exhausted'}
                                </div>
                              </div>
                              {!key.available && key.cooldownRemainingSeconds > 0 && (
                                <div className="text-[11px] text-orange-400 font-bold">
                                  Cooldown: {key.cooldownRemainingSeconds}s remaining
                                </div>
                              )}
                              {key.consecutiveExhaustions > 0 && (
                                <div className="text-[10px] text-app-text-muted">
                                  Exhaustions: {key.consecutiveExhaustions}×
                                </div>
                              )}
                              {/* Quota health bar */}
                              <div className="h-1.5 bg-app-primary/10 rounded-full overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full transition-all', key.available ? 'bg-green-400' : 'bg-red-400')}
                                  style={{ width: key.available ? '100%' : `${Math.max(0, 100 - (key.consecutiveExhaustions * 25))}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* TTS Keys */}
                      <div className="bg-app-bg border border-app-primary/10 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center gap-2">
                          <Key size={16} className="text-blue-400" />
                          <h4 className="text-sm font-bold text-app-text">TTS API Keys</h4>
                          <span className="text-[10px] text-app-text-muted">(generate-tts endpoint)</span>
                        </div>
                        {geminiStatus.tts.lastSyncedAt && (
                          <p className="text-[10px] text-app-text-muted">Last synced: {new Date(geminiStatus.tts.lastSyncedAt).toLocaleTimeString()}</p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {geminiStatus.tts.keys.map(key => (
                            <div key={key.index} className={cn(
                              "border rounded-xl p-4 space-y-2",
                              key.available ? "border-green-400/30 bg-green-400/5" : "border-red-400/30 bg-red-400/5"
                            )}>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-app-text">TTS Key #{key.index + 1}</span>
                                <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold',
                                  key.available ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                                )}>
                                  {key.available ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                                  {key.available ? 'Available' : 'Exhausted'}
                                </div>
                              </div>
                              {!key.available && key.cooldownRemainingSeconds > 0 && (
                                <div className="text-[11px] text-orange-400 font-bold">
                                  Cooldown: {key.cooldownRemainingSeconds}s remaining
                                </div>
                              )}
                              {key.consecutiveExhaustions > 0 && (
                                <div className="text-[10px] text-app-text-muted">
                                  Exhaustions: {key.consecutiveExhaustions}×
                                </div>
                              )}
                              <div className="h-1.5 bg-app-primary/10 rounded-full overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full transition-all', key.available ? 'bg-green-400' : 'bg-red-400')}
                                  style={{ width: key.available ? '100%' : `${Math.max(0, 100 - (key.consecutiveExhaustions * 25))}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
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
    </div>
  );
}

