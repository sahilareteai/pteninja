import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Mail,
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
  Smartphone,
  Laptop,
  Share2,
  Download,
  Copy,
  Check,
  Filter,
  ExternalLink,
  Briefcase,
  GraduationCap,
  ChevronRight,
  Menu,
  Sparkles,
  CheckSquare,
  Square,
} from 'lucide-react';
import { db, collection, getDocs, getDoc, doc, updateDoc, setDoc, OperationType, handleFirestoreError, auth } from '../firebase';
import { UserData, SUBSCRIPTION_PLANS, PTE_TASKS } from '../types';
import { PromoCode } from '../services/promoService';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

export interface ReferralStudentDetail {
  uid: string;
  displayName: string;
  email: string;
  createdAt: string;
  platform: 'mobile' | 'web';
  subscriptionStatus: UserData['subscriptionStatus'];
  planId?: string;
  tasksCount: number;
}

export interface ReferralGroup {
  code: string;
  ownerName: string;
  ownerEmail: string;
  ownerUid?: string;
  isBusinessPartner: boolean;
  partnerNotes?: string;
  totalReferred: number;
  mobileInstalls: number;
  webSignups: number;
  paidUsers: number;
  conversionRate: number;
  estimatedRevenue: number;
  students: ReferralStudentDetail[];
  lastReferredAt?: string;
}

interface AdminUser extends UserData {
  uid: string;
}

export const getUserPlatform = (u: AdminUser | UserData): 'mobile' | 'web' => {
  const p = (u.signupPlatform || (u as any).platform || '').toLowerCase().trim();
  if (p === 'mobile' || p === 'android' || p === 'ios') return 'mobile';
  return 'web';
};

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
  const [activeTab, setActiveTab] = useState<'analytics' | 'users' | 'referrals' | 'promoCodes' | 'apiKeys'>('analytics');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userFilter, setUserFilter] = useState<'all' | 'paid' | 'guests' | 'mobile' | 'web'>('all');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Referral & Affiliates state
  const [referralLogs, setReferralLogs] = useState<any[]>([]);
  const [referralSearch, setReferralSearch] = useState('');
  const [referralFilter, setReferralFilter] = useState<'all' | 'partners' | 'high_converting' | 'mobile_leads'>('all');
  const [selectedReferralGroup, setSelectedReferralGroup] = useState<ReferralGroup | null>(null);
  const [selectedStudentFilter, setSelectedStudentFilter] = useState<'all' | 'paid' | 'mobile'>('all');
  const [isAddingPartner, setIsAddingPartner] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [newPartner, setNewPartner] = useState({
    code: '',
    partnerName: '',
    email: '',
    discountPercent: 10,
    notes: ''
  });
  const hasFetchedReferrals = useRef(false);

  // Email modal & selection state
  const [selectedEmailUser, setSelectedEmailUser] = useState<AdminUser | null>(null);
  const [emailTargetUsers, setEmailTargetUsers] = useState<AdminUser[]>([]);
  const [selectedUserUids, setSelectedUserUids] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<'diwali' | 'payment' | 'maintenance' | null>('diwali');
  const [emailPreviewMode, setEmailPreviewMode] = useState<'edit' | 'preview'>('edit');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSendingMigrationEmails, setIsSendingMigrationEmails] = useState(false);
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
    } else if (activeTab === 'referrals') {
      fetchReferralData();
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

  const fetchReferralData = async (force = false) => {
    if (hasFetchedReferrals.current && !force && users.length > 0) return;
    setIsLoading(true);
    try {
      const [usersSnap, promosSnap, logsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'promoCodes')),
        getDocs(collection(db, 'referralLogs')).catch(() => ({ forEach: () => {} } as any)),
      ]);
      const usersList: AdminUser[] = [];
      usersSnap.forEach((doc) => {
        usersList.push({ uid: doc.id, ...doc.data() } as AdminUser);
      });
      setUsers(usersList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

      const promoList: PromoCode[] = [];
      promosSnap.forEach((doc) => {
        promoList.push(doc.data() as PromoCode);
      });
      setPromoCodes(promoList);

      const logsList: any[] = [];
      if (logsSnap && logsSnap.forEach) {
        logsSnap.forEach((doc: any) => {
          logsList.push({ id: doc.id, ...doc.data() });
        });
      }
      setReferralLogs(logsList);
      hasFetchedUsers.current = true;
      hasFetchedPromos.current = true;
      hasFetchedReferrals.current = true;
    } catch (error) {
      console.error('Error fetching referral data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePartnerCode = async () => {
    if (!newPartner.code || !newPartner.partnerName) {
      toast.error('Please provide both code and partner name');
      return;
    }
    const cleanCode = newPartner.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    try {
      const partnerData: PromoCode = {
        code: cleanCode,
        discountPercent: Number(newPartner.discountPercent) || 10,
        description: `${newPartner.partnerName} (${newPartner.notes || 'Business Partner'})`,
        isActive: true,
        isReferral: true,
        referrerName: newPartner.partnerName.trim(),
      };
      await setDoc(doc(db, 'promoCodes', cleanCode), partnerData);
      setPromoCodes(prev => [...prev.filter(p => p.code !== cleanCode), partnerData]);
      setIsAddingPartner(false);
      setNewPartner({ code: '', partnerName: '', email: '', discountPercent: 10, notes: '' });
      toast.success(`Partner code ${cleanCode} created for ${partnerData.referrerName}!`);
    } catch (err) {
      console.error('Failed to create partner code:', err);
      toast.error('Failed to create partner code');
    }
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    toast.success(`Copied "${text}" to clipboard`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleExportReferralCSV = () => {
    if (referralGroups.length === 0) {
      toast.error('No referral data to export');
      return;
    }
    const headers = ['Referral Code', 'Partner / Referrer', 'Email', 'Total Referred', 'Mobile Installs', 'Web Signups', 'Paid Users', 'Conversion Rate %', 'Est Revenue ($)', 'Last Referred Date'];
    const rows = referralGroups.map(g => [
      `"${g.code}"`,
      `"${g.ownerName.replace(/"/g, '""')}"`,
      `"${g.ownerEmail}"`,
      g.totalReferred,
      g.mobileInstalls,
      g.webSignups,
      g.paidUsers,
      `${g.conversionRate}%`,
      g.estimatedRevenue,
      `"${g.lastReferredAt || 'N/A'}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pteninja_referrals_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Referral report exported successfully!');
  };

  const referralGroups = useMemo(() => {
    const codeMap: Record<string, {
      code: string;
      students: ReferralStudentDetail[];
    }> = {};

    promoCodes.forEach(p => {
      const c = p.code.toUpperCase();
      if (!codeMap[c]) codeMap[c] = { code: c, students: [] };
    });

    users.forEach(u => {
      if (u.referralCode) {
        const c = u.referralCode.toUpperCase();
        if (!codeMap[c]) codeMap[c] = { code: c, students: [] };
      }
    });

    users.forEach(student => {
      const refCode = student.referredBy ? student.referredBy.trim().toUpperCase() : null;
      if (!refCode) return;
      if (!codeMap[refCode]) {
        codeMap[refCode] = { code: refCode, students: [] };
      }
      const platform: 'mobile' | 'web' = getUserPlatform(student);
      const completedCount = student.completedTasks?.length || 0;
      codeMap[refCode].students.push({
        uid: student.uid,
        displayName: student.displayName || 'Anonymous Student',
        email: student.email || 'No email',
        createdAt: student.createdAt,
        platform,
        subscriptionStatus: student.subscriptionStatus || 'trial',
        planId: student.planId,
        tasksCount: completedCount,
      });
    });

    const planValues: Record<string, number> = {
      weekly: 11,
      monthly: 35,
      quarterly: 85,
      annual: 199,
    };

    const groups: ReferralGroup[] = Object.values(codeMap).map(item => {
      const code = item.code;
      const ownerUser = users.find(u => u.referralCode?.toUpperCase() === code);
      const partnerPromo = promoCodes.find(p => p.code?.toUpperCase() === code);

      const ownerName = ownerUser?.displayName || partnerPromo?.referrerName || partnerPromo?.description || (ownerUser ? 'Student' : 'Partner Campaign');
      const ownerEmail = ownerUser?.email || '';
      const isBusiness = !ownerUser || Boolean(partnerPromo?.isReferral) || code.includes('-EDU') || code.includes('PARTNER') || code.length < 9;
      const partnerNotes = partnerPromo?.description;

      const totalReferred = item.students.length;
      const mobileInstalls = item.students.filter(s => s.platform === 'mobile').length;
      const webSignups = item.students.filter(s => s.platform === 'web').length;
      const paidStudents = item.students.filter(s => s.subscriptionStatus === 'active' || Boolean(s.planId));
      const paidUsers = paidStudents.length;
      const conversionRate = totalReferred > 0 ? Math.round((paidUsers / totalReferred) * 100) : 0;
      
      const estimatedRevenue = paidStudents.reduce((acc, s) => {
        const planVal = s.planId ? (planValues[s.planId] || 35) : 35;
        return acc + planVal;
      }, 0);

      item.students.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const lastReferredAt = item.students[0]?.createdAt;

      return {
        code,
        ownerName,
        ownerEmail,
        ownerUid: ownerUser?.uid,
        isBusinessPartner: isBusiness,
        partnerNotes,
        totalReferred,
        mobileInstalls,
        webSignups,
        paidUsers,
        conversionRate,
        estimatedRevenue,
        students: item.students,
        lastReferredAt,
      };
    });

    return groups.sort((a, b) => {
      if (b.totalReferred !== a.totalReferred) {
        return b.totalReferred - a.totalReferred;
      }
      return b.paidUsers - a.paidUsers;
    });
  }, [users, promoCodes, referralLogs]);

  const referralStats = useMemo(() => {
    let totalReferred = 0;
    let totalPaid = 0;
    let totalMobile = 0;
    let totalRevenue = 0;

    referralGroups.forEach(g => {
      totalReferred += g.totalReferred;
      totalPaid += g.paidUsers;
      totalMobile += g.mobileInstalls;
      totalRevenue += g.estimatedRevenue;
    });

    const globalConversionRate = totalReferred > 0 ? Math.round((totalPaid / totalReferred) * 100) : 0;
    const topPerformer = referralGroups.find(g => g.totalReferred > 0);

    return {
      totalReferred,
      totalPaid,
      totalMobile,
      totalRevenue,
      globalConversionRate,
      topPerformer,
      activeCodesCount: referralGroups.filter(g => g.totalReferred > 0).length,
      totalPartnersCount: referralGroups.length,
    };
  }, [referralGroups]);

  const filteredReferralGroups = useMemo(() => {
    return referralGroups.filter(g => {
      if (referralSearch) {
        const q = referralSearch.toLowerCase();
        const matchCode = g.code.toLowerCase().includes(q);
        const matchName = g.ownerName.toLowerCase().includes(q);
        const matchEmail = g.ownerEmail.toLowerCase().includes(q);
        const matchStudent = g.students.some(s => s.displayName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
        if (!matchCode && !matchName && !matchEmail && !matchStudent) return false;
      }

      if (referralFilter === 'partners') {
        return g.isBusinessPartner || g.totalReferred >= 2;
      }
      if (referralFilter === 'high_converting') {
        return g.conversionRate >= 20 && g.totalReferred >= 1;
      }
      if (referralFilter === 'mobile_leads') {
        return g.mobileInstalls > 0;
      }
      return true;
    });
  }, [referralGroups, referralSearch, referralFilter]);

  const filteredStudentsInGroup = useMemo(() => {
    if (!selectedReferralGroup) return [];
    return selectedReferralGroup.students.filter(s => {
      if (selectedStudentFilter === 'paid') return s.subscriptionStatus === 'active' || Boolean(s.planId);
      if (selectedStudentFilter === 'mobile') return s.platform === 'mobile';
      return true;
    });
  }, [selectedReferralGroup, selectedStudentFilter]);

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

  const handleBulkDelete = async () => {
    if (selectedUserUids.size === 0) return;
    setIsBulkDeleting(true);
    const targetUids = Array.from(selectedUserUids);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      let successCount = 0;
      const response = await fetch('/api/admin/bulk-delete-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ uids: targetUids }),
      });

      if (response.ok) {
        const data = await response.json();
        successCount = data.count || targetUids.length;
      } else {
        // Fallback: delete individually via /api/delete-user
        console.warn('Bulk delete endpoint failed, falling back to individual deletes');
        const results = await Promise.allSettled(
          targetUids.map(uid =>
            fetch('/api/delete-user', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
              },
              body: JSON.stringify({ uid }),
            })
          )
        );
        successCount = results.filter(r => r.status === 'fulfilled' && (r.value as Response).ok).length;
        if (successCount === 0) {
          throw new Error('Failed to delete selected users');
        }
      }

      const deletedSet = new Set(targetUids);
      setUsers(prev => prev.filter(u => !deletedSet.has(u.uid)));
      setSelectedUserUids(new Set());
      setShowBulkDeleteModal(false);

      setAnalytics(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          users: {
            ...prev.users,
            totalUsers: Math.max(0, prev.users.totalUsers - successCount),
          },
        };
      });

      hasFetchedAnalytics.current = false;
      hasFetchedUsers.current = false;
      toast.success(`Successfully deleted ${successCount} user${successCount !== 1 ? 's' : ''}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete selected users');
      console.error('Bulk delete users error:', error);
    } finally {
      setIsBulkDeleting(false);
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
        planId: (overridePlan || undefined) as UserData['planId'],
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
    const q = searchQuery.toLowerCase();
    const matchesSearch = (u.email?.toLowerCase() || '').includes(q) || 
                         (u.displayName?.toLowerCase() || '').includes(q) ||
                         (u.phoneNumber?.toLowerCase() || '').includes(q) ||
                         u.uid.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (userFilter === 'paid') return u.subscriptionStatus === 'active';
    if (userFilter === 'guests') return u.accessType === 'guest';
    if (userFilter === 'mobile') return getUserPlatform(u) === 'mobile';
    if (userFilter === 'web') return getUserPlatform(u) === 'web';
    return true;
  });

  const guestCount = users.filter(u => u.accessType === 'guest').length;
  const paidCount = users.filter(u => u.subscriptionStatus === 'active').length;
  const mobileCount = users.filter(u => getUserPlatform(u) === 'mobile').length;
  const webCount = users.filter(u => getUserPlatform(u) === 'web').length;

  const selectableUsers = useMemo(() => filteredUsers, [filteredUsers]);
  const isAllSelected = selectableUsers.length > 0 && selectableUsers.every(u => selectedUserUids.has(u.uid));
  const isSomeSelected = selectedUserUids.size > 0 && !isAllSelected;

  const toggleSelectUser = (uid: string) => {
    setSelectedUserUids(prev => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedUserUids(new Set());
    } else {
      setSelectedUserUids(new Set(selectableUsers.map(u => u.uid)));
    }
  };

  const applyDiwaliTemplate = (targets: AdminUser[] = emailTargetUsers) => {
    setSelectedTemplate('diwali');
    setEmailSubject('🪔 Happy Diwali from PTE Ninja! Celebrate with an Additional 20% OFF ✨');
    setEmailBody(
      `Wishing you and your loved ones a joyous, luminous, and prosperous Diwali!\n\n` +
      `May this sacred festival of lights illuminate your path toward your highest ambitions, career milestones, and PTE Academic success.\n\n` +
      `As part of our Diwali celebrations, we are delighted to offer an exclusive festive gift:\n\n` +
      `🎁 Get an Additional 20% OFF on all PTE Ninja plans!\n` +
      `Voucher Code: DIWALI20\n\n` +
      `Whether you are beginning your preparation or targeting a 79+ score for your migration or study goals, PTE Ninja equips you with:\n` +
      `• 🎙️ PTE-calibrated AI scoring for Speaking, Writing, Reading & Listening\n` +
      `• 📚 5,000+ latest real exam-predicted questions and full mock tests\n` +
      `• ⚡ Instant phoneme-level pronunciation breakdown and score-boosting tips\n\n` +
      `How to claim your festive discount:\n` +
      `1. Visit https://pteninja.com\n` +
      `2. Sign in to your account and open Plans & Pricing\n` +
      `3. Enter voucher code DIWALI20 at checkout to unlock your additional 20% off!\n\n` +
      `This special festive offer is valid for a limited time during Diwali week.\n\n` +
      `May your learning journey shine brighter than ever this festive season!\n\n` +
      `Warm festive regards,\nThe PTE Ninja Team\nhttps://pteninja.com`
    );
  };

  const applyPaymentTemplate = (targets: AdminUser[] = emailTargetUsers) => {
    setSelectedTemplate('payment');
    setEmailSubject('Payment Gateway Updated to Razorpay');
    const nameStr = targets.length === 1 ? (targets[0].displayName || 'there') : 'there';
    setEmailBody(
      `Hi ${nameStr},\n\nWe have updated our payment gateway from Stripe to Razorpay to provide a smoother checkout experience. As part of this transition, your existing subscription will continue until its expiry date.\n\nThank you for learning with PTENinja!`
    );
  };

  const applyMaintenanceTemplate = (targets: AdminUser[] = emailTargetUsers) => {
    setSelectedTemplate('maintenance');
    setEmailSubject('Sorry for the inconvenience caused');
    const nameStr = targets.length === 1 ? (targets[0].displayName || 'there') : 'there';
    setEmailBody(
      `Hi ${nameStr},\n\nWe recently experienced some maintenance issues on our platform. We sincerely apologize for any inconvenience this may have caused you.\n\nEverything is fully operational now, and you should be able to browse smoothly.\n\nHappy Learning!`
    );
  };

  const openEmailModalForUsers = (targets: AdminUser[]) => {
    if (targets.length === 0) {
      toast.error("No valid users selected with email addresses.");
      return;
    }
    setEmailTargetUsers(targets);
    setSelectedEmailUser(targets[0]);
    setEmailPreviewMode('edit');
    applyDiwaliTemplate(targets);
  };

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

  const navigationItems = [
    { 
      id: 'analytics' as const, 
      label: 'Analytics', 
      desc: 'Platform engagement & practice trends', 
      icon: BarChart3,
      badge: undefined
    },
    { 
      id: 'users' as const, 
      label: 'Users & Students', 
      desc: 'Directory, paid plans & account access', 
      icon: Users,
      badge: users.length > 0 ? users.length : undefined
    },
    { 
      id: 'referrals' as const, 
      label: 'Referrals & Affiliates', 
      desc: 'Partner codes, mobile app & conversion tracking', 
      icon: TrendingUp,
      badge: referralStats.totalReferred > 0 ? referralStats.totalReferred : undefined
    },
    { 
      id: 'promoCodes' as const, 
      label: 'Promo Codes', 
      desc: 'Discounts, special offers & coupons', 
      icon: Ticket,
      badge: promoCodes.length > 0 ? promoCodes.length : undefined
    },
    { 
      id: 'apiKeys' as const, 
      label: 'API Keys & Quota', 
      desc: 'Gemini, Vertex & TTS engine health', 
      icon: Key,
      badge: geminiStatus ? `${geminiStatus.availableKeys} avail` : undefined
    },
  ];

  const currentTabInfo = {
    analytics: {
      title: 'Platform Analytics',
      subtitle: 'Real-time overview of users, task completions, test attempts, and support trends.',
    },
    users: {
      title: 'User Management',
      subtitle: `Directory of all ${users.length} registered students, trial members, and paid subscribers.`,
    },
    referrals: {
      title: 'Referrals & Business Affiliates',
      subtitle: 'Complete tracking of referral codes, partner coaching institutes, mobile app downloads, and paid conversions.',
    },
    promoCodes: {
      title: 'Promotional Discounts',
      subtitle: 'Create, monitor, and toggle discount codes for marketing campaigns.',
    },
    apiKeys: {
      title: 'AI Key Monitor & Quota',
      subtitle: 'Gemini Developer & Vertex AI key exhaustion status, daily token usage, and TTS engine health.',
    },
  }[activeTab];

  return (
    <div className="fixed inset-0 z-[120] bg-app-bg text-app-text flex flex-col lg:flex-row overflow-hidden font-sans">
      {/* ── Left Side Panel (Sidebar) ── */}
      <aside className={cn(
        "bg-app-surface border-r border-app-primary/10 flex flex-col shrink-0 lg:h-full z-30 transition-all duration-300",
        "w-full lg:w-72",
        isMobileMenuOpen ? "fixed inset-0 lg:static z-50 flex" : "hidden lg:flex"
      )}>
        {/* Sidebar Brand Header */}
        <div className="p-5 border-b border-app-primary/10 flex items-center justify-between shrink-0 bg-app-surface">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-app-primary to-app-accent rounded-2xl flex items-center justify-center text-app-bg shadow-md shadow-app-primary/20">
              <Shield size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-app-text tracking-tight">Admin Portal</h2>
                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-app-primary/20 text-app-primary border border-app-primary/30">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-app-text-muted">PTE Ninja Command Center</p>
            </div>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-2 hover:bg-app-primary/10 rounded-xl text-app-text-muted transition-colors"
          >
            <XCircle size={22} />
          </button>
        </div>

        {/* Sidebar Navigation Menu Items in Grid / List Cards */}
        <div className="p-3.5 flex-1 overflow-y-auto space-y-2 custom-scrollbar">
          <div className="px-2 py-1 text-[10px] font-black uppercase tracking-widest text-app-text-muted/80">
            Control Center
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            {navigationItems.map(item => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all group relative border",
                    isActive 
                      ? "bg-app-primary text-app-bg font-bold border-app-primary shadow-lg shadow-app-primary/25 translate-x-1" 
                      : "bg-app-bg/40 hover:bg-app-surface border-app-primary/5 hover:border-app-primary/20 text-app-text-muted hover:text-app-text"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all",
                    isActive 
                      ? "bg-app-bg text-app-primary shadow-sm" 
                      : "bg-app-primary/10 text-app-primary group-hover:bg-app-primary/20"
                  )}>
                    <Icon size={19} className="stroke-[2.2]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn("text-xs font-black truncate", isActive ? "text-app-bg" : "text-app-text")}>
                        {item.label}
                      </span>
                      {item.badge !== undefined && (
                        <span className={cn(
                          "text-[10px] font-black px-2 py-0.5 rounded-full shrink-0",
                          isActive
                            ? "bg-app-bg text-app-primary"
                            : "bg-app-primary/15 text-app-primary"
                        )}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className={cn(
                      "text-[10px] truncate mt-0.5",
                      isActive ? "text-app-bg/85 font-medium" : "text-app-text-muted"
                    )}>
                      {item.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer - Admin Info & Exit Button */}
        <div className="p-4 border-t border-app-primary/10 bg-app-surface/60 space-y-3 shrink-0">
          <div className="flex items-center gap-3 px-1">
            <div className="w-9 h-9 rounded-xl bg-app-primary/15 border border-app-primary/30 flex items-center justify-center text-xs font-black text-app-primary shrink-0">
              {auth.currentUser?.displayName?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-app-text truncate">{auth.currentUser?.displayName || 'Administrator'}</p>
              <p className="text-[10px] text-app-text-muted truncate">{auth.currentUser?.email || 'admin@pteninja.com'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-app-bg hover:bg-app-primary/10 border border-app-primary/20 rounded-xl text-xs font-bold text-app-text transition-all group shadow-sm"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform text-app-primary" />
            <span>Return to Student App</span>
          </button>
        </div>
      </aside>

      {/* ── Main Dashboard Body ── */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-app-bg/50 relative">
        {/* Top Header Bar */}
        <header className="px-5 py-4 border-b border-app-primary/10 bg-app-surface/50 backdrop-blur-md flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 bg-app-bg border border-app-primary/20 rounded-xl text-app-text hover:bg-app-primary/10 transition-colors"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <div>
              <h1 className="text-lg font-black text-app-text tracking-tight flex items-center gap-2">
                {currentTabInfo.title}
              </h1>
              <p className="text-xs text-app-text-muted hidden sm:block">{currentTabInfo.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-app-surface hover:bg-app-primary/10 border border-app-primary/20 rounded-xl text-xs font-bold text-app-text transition-colors"
              title="Close Admin and return to application"
            >
              <XCircle size={15} className="text-app-text-muted" />
              <span className="hidden sm:inline">Exit Admin</span>
            </button>
          </div>
        </header>

        {/* Scrollable Content View */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
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
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 bg-app-bg p-1 rounded-xl border border-app-primary/10 flex-wrap">
                        <button 
                          onClick={() => setUserFilter('all')}
                          className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", userFilter === 'all' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text")}
                        >
                          All ({users.length})
                        </button>
                        <button 
                          onClick={() => setUserFilter('paid')}
                          className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", userFilter === 'paid' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text")}
                        >
                          Paid ({paidCount})
                        </button>
                        <button 
                          onClick={() => setUserFilter('guests')}
                          className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", userFilter === 'guests' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text")}
                        >
                          Guests ({guestCount})
                        </button>
                        <button 
                          onClick={() => setUserFilter('mobile')}
                          className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5", userFilter === 'mobile' ? "bg-sky-500 text-white" : "text-app-text-muted hover:text-sky-500")}
                        >
                          <Smartphone size={13} />
                          Mobile ({mobileCount})
                        </button>
                        <button 
                          onClick={() => setUserFilter('web')}
                          className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5", userFilter === 'web' ? "bg-indigo-500 text-white" : "text-app-text-muted hover:text-indigo-400")}
                        >
                          <Globe size={13} />
                          Web ({webCount})
                        </button>
                      </div>

                      {/* Select All Toggle Button */}
                      <button
                        onClick={handleSelectAll}
                        disabled={selectableUsers.length === 0}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer disabled:opacity-50",
                          isAllSelected
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-500 dark:text-amber-400 font-extrabold"
                            : "bg-app-bg border-app-primary/10 text-app-text-muted hover:text-app-text hover:border-app-primary/30"
                        )}
                        title={isAllSelected ? "Deselect all visible users" : `Select all ${selectableUsers.length} visible users`}
                      >
                        <CheckSquare size={14} />
                        {isAllSelected ? 'Deselect All' : `Select All (${selectableUsers.length})`}
                      </button>

                      {/* Email All / Email Selected Action Button */}
                      <button
                        onClick={() => {
                          const targetsWithEmail = users.filter(u => selectedUserUids.has(u.uid) && !!u.email);
                          if (selectedUserUids.size > 0) {
                            if (targetsWithEmail.length === 0) {
                              toast.error("None of the selected users have an email address.");
                              return;
                            }
                            openEmailModalForUsers(targetsWithEmail);
                          } else {
                            const allWithEmail = selectableUsers.filter(u => !!u.email);
                            if (allWithEmail.length === 0) {
                              toast.error("No users with email addresses found in the current view.");
                              return;
                            }
                            openEmailModalForUsers(allWithEmail);
                          }
                        }}
                        disabled={selectableUsers.length === 0}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-black bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 text-slate-950 rounded-xl hover:brightness-110 shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                        title={selectedUserUids.size > 0 ? `Send email to selected users with emails` : `Send email to all users with emails`}
                      >
                        <Mail size={14} className="stroke-[2.5]" />
                        {selectedUserUids.size > 0 
                          ? `Email Selected (${users.filter(u => selectedUserUids.has(u.uid) && !!u.email).length})` 
                          : `Email Users (${selectableUsers.filter(u => !!u.email).length})`
                        }
                      </button>

                      {/* Delete Selected in Bulk Button */}
                      {selectedUserUids.size > 0 && (
                        <button
                          onClick={() => setShowBulkDeleteModal(true)}
                          disabled={isBulkDeleting}
                          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-black bg-red-500 text-white rounded-xl hover:bg-red-600 shadow-md shadow-red-500/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                          title={`Delete ${selectedUserUids.size} selected users`}
                        >
                          <Trash2 size={14} className="stroke-[2.5]" />
                          Delete Selected ({selectedUserUids.size})
                        </button>
                      )}

                      <button
                        onClick={() => fetchData(true)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-app-bg border border-app-primary/10 rounded-xl text-app-text-muted hover:text-app-primary hover:border-app-primary/30 transition-all cursor-pointer"
                        title="Refresh user list"
                      >
                        <RefreshCw size={14} />
                        Refresh
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm("Are you sure you want to trigger migration emails to ALL paid Stripe users? This will be done once.")) return;
                          setIsSendingMigrationEmails(true);
                          try {
                            const token = await auth.currentUser?.getIdToken();
                            const res = await fetch('/api/admin/trigger-migration-emails', {
                              method: 'POST',
                              headers: { Authorization: `Bearer ${token}` }
                            });
                            const data = await res.json();
                            if (res.ok) {
                              toast.success(`Successfully sent ${data.successCount} migration emails`);
                            } else {
                              toast.error(data.error || "Failed to send migration emails");
                            }
                          } catch (err) {
                            console.error(err);
                            toast.error("Failed to trigger migration emails");
                          } finally {
                            setIsSendingMigrationEmails(false);
                          }
                        }}
                        disabled={isSendingMigrationEmails}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-app-bg border border-blue-500/20 rounded-xl text-blue-400 hover:text-blue-500 hover:border-blue-500/40 transition-all disabled:opacity-50"
                        title="Send migration emails to Stripe users"
                      >
                        {isSendingMigrationEmails ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                        Trigger Migration Emails
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

                  {/* Floating / Sticky Selected Users Action Bar */}
                  {selectedUserUids.size > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-2.5 mb-4 text-xs font-semibold text-app-text shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-black text-amber-500 dark:text-amber-400 flex items-center gap-1.5">
                          <CheckSquare size={16} />
                          {selectedUserUids.size} of {selectableUsers.length} users selected
                        </span>
                        <span className="text-app-text-muted">|</span>
                        <button
                          onClick={handleSelectAll}
                          className="text-app-primary hover:underline font-bold cursor-pointer"
                        >
                          {isAllSelected ? 'Deselect all' : `Select all (${selectableUsers.length})`}
                        </button>
                        <button
                          onClick={() => setSelectedUserUids(new Set())}
                          className="text-red-400 hover:underline cursor-pointer"
                        >
                          Clear selection
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowBulkDeleteModal(true)}
                          disabled={isBulkDeleting}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-black shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                        >
                          <Trash2 size={13} className="stroke-[2.5]" />
                          Delete ({selectedUserUids.size})
                        </button>
                        <button
                          onClick={() => {
                            const targetsWithEmail = users.filter(u => selectedUserUids.has(u.uid) && !!u.email);
                            if (targetsWithEmail.length === 0) {
                              toast.error("None of the selected users have an email address.");
                              return;
                            }
                            openEmailModalForUsers(targetsWithEmail);
                          }}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 text-slate-950 rounded-xl text-xs font-black hover:brightness-110 shadow-sm transition-all cursor-pointer active:scale-95"
                        >
                          <Mail size={13} className="stroke-[2.5]" />
                          Send Email ({users.filter(u => selectedUserUids.has(u.uid) && !!u.email).length})
                        </button>
                      </div>
                    </motion.div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-app-text-muted text-xs uppercase tracking-wider border-b border-app-primary/10">
                          <th className="px-3 py-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={isAllSelected}
                              ref={el => { if (el) el.indeterminate = isSomeSelected; }}
                              onChange={handleSelectAll}
                              className="w-4 h-4 rounded text-amber-500 border-app-primary/30 focus:ring-amber-500 cursor-pointer accent-amber-500"
                              title={isAllSelected ? "Deselect all" : `Select all ${selectableUsers.length} users`}
                            />
                          </th>
                          <th className="px-4 py-3 font-bold">User</th>
                          <th className="px-4 py-3 font-bold">Platform</th>
                          <th className="px-4 py-3 font-bold">Status</th>
                          <th className="px-4 py-3 font-bold">Plan</th>
                          <th className="px-4 py-3 font-bold">Joined</th>
                          <th className="px-4 py-3 font-bold">Role</th>
                          <th className="px-4 py-3 font-bold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-app-primary/5">
                        {filteredUsers.map((user) => {
                          const isSelected = selectedUserUids.has(user.uid);
                          return (
                            <tr 
                              key={user.uid} 
                              className={cn(
                                "transition-colors",
                                isSelected ? "bg-amber-500/10 dark:bg-amber-950/25" : "hover:bg-app-primary/5"
                              )}
                            >
                              <td className="px-3 py-4 w-10 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectUser(user.uid)}
                                  className="w-4 h-4 rounded text-amber-500 border-app-primary/30 focus:ring-amber-500 cursor-pointer accent-amber-500"
                                  title={`Select ${user.displayName || user.email || 'guest'}`}
                                />
                              </td>
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
                                    <div className="text-xs text-app-text-muted">
                                      {user.email || 'No email provided'}
                                      {user.phoneNumber ? ` • 📞 ${user.phoneNumber}` : ''}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                {getUserPlatform(user) === 'mobile' ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-sky-500/10 text-sky-500 dark:text-sky-400 border border-sky-500/20" title="Registered via Mobile App (Android/iOS)">
                                    <Smartphone size={12} className="stroke-[2.5]" />
                                    Mobile App
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20" title="Registered via Web Browser">
                                    <Globe size={12} className="stroke-[2.5]" />
                                    Web
                                  </span>
                                )}
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
                                    onClick={() => openEmailModalForUsers([user])}
                                    className="p-2 rounded-xl bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-all cursor-pointer"
                                    title="Send Email"
                                  >
                                    <Mail size={16} />
                                  </button>
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
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* ── REFERRALS & AFFILIATES TAB ── */}
              {activeTab === 'referrals' && (
                <div className="space-y-6">
                  {/* Top KPI Metrics Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="bg-app-surface border border-app-primary/10 rounded-2xl p-4 flex flex-col gap-1.5 shadow-sm">
                      <div className="w-8 h-8 rounded-xl bg-app-primary/10 flex items-center justify-center text-app-primary">
                        <Share2 size={16} />
                      </div>
                      <div className="text-2xl font-black text-app-text">{referralStats.totalReferred}</div>
                      <div className="text-[10px] font-bold text-app-text-muted uppercase tracking-wider">Total Referred</div>
                    </div>

                    <div className="bg-app-surface border border-app-primary/10 rounded-2xl p-4 flex flex-col gap-1.5 shadow-sm">
                      <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center text-green-400">
                        <CheckCircle size={16} />
                      </div>
                      <div className="text-2xl font-black text-green-400">{referralStats.totalPaid}</div>
                      <div className="text-[10px] font-bold text-app-text-muted uppercase tracking-wider">Paid Subscribers</div>
                    </div>

                    <div className="bg-app-surface border border-app-primary/10 rounded-2xl p-4 flex flex-col gap-1.5 shadow-sm">
                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <TrendingUp size={16} />
                      </div>
                      <div className="text-2xl font-black text-blue-400">{referralStats.globalConversionRate}%</div>
                      <div className="text-[10px] font-bold text-app-text-muted uppercase tracking-wider">Conversion Rate</div>
                    </div>

                    <div className="bg-app-surface border border-app-primary/10 rounded-2xl p-4 flex flex-col gap-1.5 shadow-sm">
                      <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                        <Smartphone size={16} />
                      </div>
                      <div className="text-2xl font-black text-purple-400">{referralStats.totalMobile}</div>
                      <div className="text-[10px] font-bold text-app-text-muted uppercase tracking-wider">Mobile App Users</div>
                    </div>

                    <div className="bg-app-surface border border-app-primary/10 rounded-2xl p-4 flex flex-col gap-1.5 shadow-sm col-span-2 sm:col-span-1">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                        <Award size={16} />
                      </div>
                      <div className="text-base sm:text-lg font-black text-amber-400 truncate">
                        {referralStats.topPerformer ? referralStats.topPerformer.code : 'None yet'}
                      </div>
                      <div className="text-[10px] font-bold text-app-text-muted uppercase tracking-wider">Top Performing Code</div>
                    </div>
                  </div>

                  {/* Actions & Filters Bar */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative max-w-md flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                      <input 
                        type="text" 
                        placeholder="Search by code, partner, student name or email..."
                        value={referralSearch}
                        onChange={(e) => setReferralSearch(e.target.value)}
                        className="w-full bg-app-surface border border-app-primary/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:border-app-primary transition-all text-app-text placeholder:text-app-text-muted/60"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1 bg-app-surface p-1 rounded-xl border border-app-primary/10">
                        <button 
                          onClick={() => setReferralFilter('all')}
                          className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", referralFilter === 'all' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text")}
                        >
                          All ({referralGroups.length})
                        </button>
                        <button 
                          onClick={() => setReferralFilter('partners')}
                          className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", referralFilter === 'partners' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text")}
                        >
                          Partners
                        </button>
                        <button 
                          onClick={() => setReferralFilter('high_converting')}
                          className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", referralFilter === 'high_converting' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text")}
                        >
                          High Converting
                        </button>
                        <button 
                          onClick={() => setReferralFilter('mobile_leads')}
                          className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", referralFilter === 'mobile_leads' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text")}
                        >
                          Mobile Leads
                        </button>
                      </div>

                      <button
                        onClick={handleExportReferralCSV}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-app-surface border border-app-primary/10 rounded-xl text-app-text-muted hover:text-app-primary hover:border-app-primary/30 transition-all shadow-sm"
                        title="Export CSV report"
                      >
                        <Download size={14} />
                        <span className="hidden sm:inline">Export CSV</span>
                      </button>

                      <button
                        onClick={() => fetchReferralData(true)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-app-surface border border-app-primary/10 rounded-xl text-app-text-muted hover:text-app-primary hover:border-app-primary/30 transition-all shadow-sm"
                        title="Refresh referral data"
                      >
                        <RefreshCw size={14} />
                        <span className="hidden sm:inline">Refresh</span>
                      </button>

                      <button
                        onClick={() => setIsAddingPartner(true)}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-app-primary text-app-bg rounded-xl hover:bg-app-accent transition-all shadow-md shadow-app-primary/20"
                      >
                        <Plus size={16} />
                        <span>Add Partner Code</span>
                      </button>
                    </div>
                  </div>

                  {/* Referrals & Partners Table */}
                  <div className="bg-app-surface border border-app-primary/10 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-app-bg/60 border-b border-app-primary/10 text-[11px] font-black uppercase tracking-wider text-app-text-muted">
                          <tr>
                            <th className="py-3.5 px-4">Referral Code & Partner</th>
                            <th className="py-3.5 px-4">Category</th>
                            <th className="py-3.5 px-4 text-center">Total Students</th>
                            <th className="py-3.5 px-4">Platform Split</th>
                            <th className="py-3.5 px-4 text-center">Paid Conversions</th>
                            <th className="py-3.5 px-4">Conversion Rate</th>
                            <th className="py-3.5 px-4 text-right">Est. Revenue</th>
                            <th className="py-3.5 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-app-primary/5">
                          {filteredReferralGroups.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-12 text-center text-app-text-muted text-xs">
                                No referral codes match your search or filter.
                              </td>
                            </tr>
                          ) : filteredReferralGroups.map(group => (
                            <tr key={group.code} className="hover:bg-app-primary/5 transition-colors group">
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-black text-xs text-app-primary bg-app-bg px-2.5 py-1 rounded-lg border border-app-primary/20">
                                    {group.code}
                                  </span>
                                  <button
                                    onClick={() => handleCopyCode(group.code)}
                                    className="text-app-text-muted hover:text-app-primary p-1 rounded transition-colors"
                                    title="Copy referral code"
                                  >
                                    {copiedCode === group.code ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                  </button>
                                </div>
                                <div className="mt-1">
                                  <p className="text-xs font-bold text-app-text">{group.ownerName}</p>
                                  {group.ownerEmail && (
                                    <p className="text-[10px] text-app-text-muted">{group.ownerEmail}</p>
                                  )}
                                </div>
                              </td>

                              <td className="py-4 px-4">
                                {group.isBusinessPartner ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                    <Briefcase size={11} /> Business / Institute
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                    <GraduationCap size={11} /> Student Ambassador
                                  </span>
                                )}
                                {group.partnerNotes && (
                                  <p className="text-[10px] text-app-text-muted mt-1 truncate max-w-xs">{group.partnerNotes}</p>
                                )}
                              </td>

                              <td className="py-4 px-4 text-center">
                                <span className="text-base font-black text-app-text">{group.totalReferred}</span>
                                <div className="text-[10px] text-app-text-muted">students</div>
                              </td>

                              <td className="py-4 px-4">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <Smartphone size={13} className="text-purple-400" />
                                    <span className="font-bold text-app-text">{group.mobileInstalls}</span>
                                    <span className="text-[10px] text-app-text-muted">Mobile App</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <Laptop size={13} className="text-blue-400" />
                                    <span className="font-bold text-app-text">{group.webSignups}</span>
                                    <span className="text-[10px] text-app-text-muted">Web Portal</span>
                                  </div>
                                </div>
                              </td>

                              <td className="py-4 px-4 text-center">
                                <span className={cn(
                                  "text-xs font-black px-2.5 py-1 rounded-lg inline-block",
                                  group.paidUsers > 0 ? "bg-green-500/10 text-green-400 border border-green-500/20" : "text-app-text-muted bg-app-bg"
                                )}>
                                  {group.paidUsers} Paid
                                </span>
                              </td>

                              <td className="py-4 px-4">
                                <div className="w-28 space-y-1">
                                  <div className="flex justify-between text-xs font-black text-app-text">
                                    <span>{group.conversionRate}%</span>
                                  </div>
                                  <div className="h-1.5 bg-app-bg rounded-full overflow-hidden">
                                    <div 
                                      className={cn("h-full rounded-full transition-all duration-500", group.conversionRate >= 20 ? "bg-green-400" : "bg-app-primary")} 
                                      style={{ width: `${Math.min(group.conversionRate, 100)}%` }} 
                                    />
                                  </div>
                                </div>
                              </td>

                              <td className="py-4 px-4 text-right font-mono font-black text-sm text-app-text">
                                ${group.estimatedRevenue.toLocaleString()}
                              </td>

                              <td className="py-4 px-4 text-right">
                                <button
                                  onClick={() => {
                                    setSelectedReferralGroup(group);
                                    setSelectedStudentFilter('all');
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-app-primary/10 hover:bg-app-primary text-app-primary hover:text-app-bg text-xs font-bold rounded-xl transition-all"
                                >
                                  <span>View Students ({group.totalReferred})</span>
                                  <ChevronRight size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
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
      </main>

      {/* ── REFERRAL STUDENT DEEP DIVE MODAL ── */}
      {selectedReferralGroup && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-app-surface border border-app-primary/20 rounded-3xl p-6 sm:p-8 w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-5 border-b border-app-primary/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-app-primary/10 rounded-2xl flex items-center justify-center text-app-primary shrink-0">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-black px-2.5 py-0.5 rounded-lg bg-app-primary/20 text-app-primary border border-app-primary/30">
                      {selectedReferralGroup.code}
                    </span>
                    <h3 className="text-lg font-black text-app-text">
                      {selectedReferralGroup.ownerName}
                    </h3>
                  </div>
                  <p className="text-xs text-app-text-muted mt-0.5">
                    Detailed list of all students and subscriptions attributed to this referral code
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedReferralGroup(null)}
                className="p-2 hover:bg-app-primary/10 rounded-xl text-app-text-muted transition-colors"
              >
                <XCircle size={24} />
              </button>
            </div>

            {/* KPI Highlights in Modal */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b border-app-primary/10 shrink-0">
              <div className="bg-app-bg p-3 rounded-xl border border-app-primary/5">
                <div className="text-xs text-app-text-muted font-bold">Total Referred</div>
                <div className="text-xl font-black text-app-text mt-0.5">{selectedReferralGroup.totalReferred}</div>
              </div>
              <div className="bg-app-bg p-3 rounded-xl border border-app-primary/5">
                <div className="text-xs text-app-text-muted font-bold">Paid Conversions</div>
                <div className="text-xl font-black text-green-400 mt-0.5">{selectedReferralGroup.paidUsers}</div>
              </div>
              <div className="bg-app-bg p-3 rounded-xl border border-app-primary/5">
                <div className="text-xs text-app-text-muted font-bold">Mobile App Users</div>
                <div className="text-xl font-black text-purple-400 mt-0.5">{selectedReferralGroup.mobileInstalls}</div>
              </div>
              <div className="bg-app-bg p-3 rounded-xl border border-app-primary/5">
                <div className="text-xs text-app-text-muted font-bold">Est. Plan Revenue</div>
                <div className="text-xl font-black text-app-primary mt-0.5">${selectedReferralGroup.estimatedRevenue}</div>
              </div>
            </div>

            {/* Filter Tabs in Modal */}
            <div className="flex items-center justify-between py-3 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedStudentFilter('all')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    selectedStudentFilter === 'all' ? "bg-app-primary text-app-bg" : "bg-app-bg text-app-text-muted hover:text-app-text"
                  )}
                >
                  All Students ({selectedReferralGroup.students.length})
                </button>
                <button
                  onClick={() => setSelectedStudentFilter('paid')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    selectedStudentFilter === 'paid' ? "bg-app-primary text-app-bg" : "bg-app-bg text-app-text-muted hover:text-app-text"
                  )}
                >
                  Paid Only ({selectedReferralGroup.paidUsers})
                </button>
                <button
                  onClick={() => setSelectedStudentFilter('mobile')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    selectedStudentFilter === 'mobile' ? "bg-app-primary text-app-bg" : "bg-app-bg text-app-text-muted hover:text-app-text"
                  )}
                >
                  Mobile App ({selectedReferralGroup.mobileInstalls})
                </button>
              </div>

              <span className="text-xs text-app-text-muted">
                Showing {filteredStudentsInGroup.length} of {selectedReferralGroup.students.length}
              </span>
            </div>

            {/* Student List Table */}
            <div className="flex-1 overflow-y-auto custom-scrollbar border border-app-primary/10 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-app-bg sticky top-0 text-app-text-muted font-black uppercase text-[10px] tracking-wider border-b border-app-primary/10 z-10">
                  <tr>
                    <th className="p-3">Student</th>
                    <th className="p-3">Signup Date</th>
                    <th className="p-3">Platform</th>
                    <th className="p-3">Subscription</th>
                    <th className="p-3 text-center">Practice Activity</th>
                    <th className="p-3 text-right">Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-primary/5">
                  {filteredStudentsInGroup.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-app-text-muted">
                        No students in this view.
                      </td>
                    </tr>
                  ) : filteredStudentsInGroup.map(student => {
                    const isPaid = student.subscriptionStatus === 'active' || Boolean(student.planId);
                    return (
                      <tr key={student.uid} className="hover:bg-app-primary/5 transition-colors">
                        <td className="p-3">
                          <p className="font-bold text-app-text text-sm">{student.displayName}</p>
                          <p className="text-[11px] text-app-text-muted">{student.email}</p>
                        </td>
                        <td className="p-3 text-app-text-muted">
                          {student.createdAt ? new Date(student.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="p-3">
                          {student.platform === 'mobile' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              <Smartphone size={11} /> Mobile App
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              <Laptop size={11} /> Web
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20">
                              <CheckCircle size={10} /> Paid {student.planId ? `(${student.planId})` : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-app-bg text-app-text-muted border border-app-primary/10">
                              {student.subscriptionStatus || 'trial'}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className="font-bold text-app-text">{student.tasksCount}</span>
                          <span className="text-app-text-muted text-[10px] ml-1">tasks</span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              const targetAdminUser = users.find(u => u.uid === student.uid) || ({
                                uid: student.uid,
                                displayName: student.displayName,
                                email: student.email,
                                createdAt: student.createdAt,
                                accessType: 'user',
                                subscriptionStatus: student.subscriptionStatus,
                              } as AdminUser);
                              setSelectedEmailUser(targetAdminUser);
                            }}
                            className="p-1.5 hover:bg-app-primary/10 rounded-lg text-app-text-muted hover:text-app-primary transition-colors"
                            title="Send email to this student"
                          >
                            <Mail size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── ADD BUSINESS PARTNER MODAL ── */}
      {isAddingPartner && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-app-surface border border-app-primary/20 rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-app-primary/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-400">
                  <Briefcase size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-app-text">Register Business Partner Code</h3>
                  <p className="text-xs text-app-text-muted">Create a trackable referral code for coaching institutes or affiliates</p>
                </div>
              </div>
              <button onClick={() => setIsAddingPartner(false)} className="text-app-text-muted hover:text-app-text">
                <XCircle size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-app-text-muted uppercase">Business / Partner Name</label>
                <input
                  type="text"
                  value={newPartner.partnerName}
                  onChange={(e) => setNewPartner({ ...newPartner, partnerName: e.target.value })}
                  placeholder="e.g. Kangaroo Education Melbourne"
                  className="w-full bg-app-bg border border-app-primary/10 rounded-xl px-4 py-2.5 text-sm text-app-text focus:outline-none focus:border-app-primary/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-app-text-muted uppercase">Custom Code</label>
                  <input
                    type="text"
                    value={newPartner.code}
                    onChange={(e) => setNewPartner({ ...newPartner, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. KANGAROO"
                    className="w-full bg-app-bg border border-app-primary/10 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-app-primary focus:outline-none focus:border-app-primary/40"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-app-text-muted uppercase">Student Discount %</label>
                  <input
                    type="number"
                    value={newPartner.discountPercent}
                    onChange={(e) => setNewPartner({ ...newPartner, discountPercent: Number(e.target.value) })}
                    className="w-full bg-app-bg border border-app-primary/10 rounded-xl px-4 py-2.5 text-sm text-app-text focus:outline-none focus:border-app-primary/40"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-app-text-muted uppercase">Contact Email</label>
                <input
                  type="email"
                  value={newPartner.email}
                  onChange={(e) => setNewPartner({ ...newPartner, email: e.target.value })}
                  placeholder="e.g. director@kangaroo.edu.au"
                  className="w-full bg-app-bg border border-app-primary/10 rounded-xl px-4 py-2.5 text-sm text-app-text focus:outline-none focus:border-app-primary/40"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-app-text-muted uppercase">Partner Notes / Details</label>
                <textarea
                  value={newPartner.notes}
                  onChange={(e) => setNewPartner({ ...newPartner, notes: e.target.value })}
                  placeholder="e.g. Expected 50 students from Nov 2026 intake. 10% commission agreement."
                  className="w-full bg-app-bg border border-app-primary/10 rounded-xl px-4 py-2 text-sm text-app-text focus:outline-none focus:border-app-primary/40 resize-none h-20"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-app-primary/10">
              <button
                onClick={() => setIsAddingPartner(false)}
                className="px-4 py-2 text-sm font-bold text-app-text-muted hover:text-app-text"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePartnerCode}
                className="px-5 py-2.5 bg-app-primary text-app-bg rounded-xl text-sm font-black hover:bg-app-accent transition-all shadow-md shadow-app-primary/20"
              >
                Create Partner Code
              </button>
            </div>
          </motion.div>
        </div>
      )}

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

      {/* Bulk Delete Users Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-app-surface border border-red-500/30 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 shrink-0">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-black text-app-text">Delete Selected Users</h3>
                <p className="text-xs text-app-text-muted">Permanent bulk deletion action</p>
              </div>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-xs space-y-2">
              <p className="font-bold text-red-500 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle size={15} />
                You are about to delete {selectedUserUids.size} user account{selectedUserUids.size > 1 ? 's' : ''}.
              </p>
              <p className="text-app-text-muted leading-relaxed">
                This will permanently delete the selected user profiles from Firestore and Firebase Authentication. This action cannot be reversed.
              </p>
              <div className="pt-1 flex flex-wrap gap-2 text-[11px] font-bold">
                <span className="px-2 py-0.5 rounded-lg bg-app-bg text-app-text border border-app-primary/10">
                  {users.filter(u => selectedUserUids.has(u.uid) && u.accessType === 'guest').length} Guest Accounts
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-app-bg text-app-text border border-app-primary/10">
                  {users.filter(u => selectedUserUids.has(u.uid) && u.accessType !== 'guest').length} Registered Accounts
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={isBulkDeleting}
                className="px-4 py-2 text-xs font-bold text-app-text-muted hover:text-app-text disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="flex items-center gap-2 bg-red-500 text-white px-5 py-2.5 rounded-xl text-xs font-black hover:bg-red-600 transition-all disabled:opacity-50 shadow-md shadow-red-500/25 cursor-pointer active:scale-95"
              >
                {isBulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {isBulkDeleting ? 'Deleting...' : `Confirm Delete (${selectedUserUids.size})`}
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
                    {getUserPlatform(selectedUser) === 'mobile' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-400 uppercase flex items-center gap-1">
                        <Smartphone size={10} /> Mobile App
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 uppercase flex items-center gap-1">
                        <Globe size={10} /> Web
                      </span>
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
                    { 
                      icon: getUserPlatform(selectedUser) === 'mobile' ? Smartphone : Globe, 
                      label: 'Platform', 
                      value: getUserPlatform(selectedUser) === 'mobile' ? 'Mobile App' : 'Web', 
                      color: getUserPlatform(selectedUser) === 'mobile' ? 'text-sky-400' : 'text-indigo-400' 
                    },
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
      {/* Send Email Modal */}
      {(selectedEmailUser || emailTargetUsers.length > 0) && (() => {
        const activeTargets = emailTargetUsers.length > 0 ? emailTargetUsers : (selectedEmailUser ? [selectedEmailUser] : []);
        const isBulk = activeTargets.length > 1;

        return (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-app-surface border border-app-primary/20 rounded-3xl p-6 w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh]"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between gap-3 mb-5 pb-4 border-b border-app-primary/10">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-amber-500/30 rounded-2xl flex items-center justify-center text-amber-500 shadow-sm">
                    <Mail size={22} className="stroke-[2.5]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-extrabold text-app-text">
                        {isBulk ? `Send Bulk Email (${activeTargets.length} Recipients)` : 'Send Email'}
                      </h3>
                      {selectedTemplate === 'diwali' && (
                        <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 font-black text-[10px] uppercase tracking-wider">
                          Diwali Edition
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-app-text-muted line-clamp-1 mt-0.5">
                      {isBulk 
                        ? `To: ${activeTargets.length} users (${activeTargets.slice(0, 3).map(u => u.email).join(', ')}${activeTargets.length > 3 ? ` + ${activeTargets.length - 3} more` : ''})`
                        : `To: ${activeTargets[0]?.email} ${activeTargets[0]?.displayName ? `(${activeTargets[0]?.displayName})` : ''}`
                      }
                    </p>
                  </div>
                </div>
                {isBulk && (
                  <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[11px] font-bold rounded-xl">
                    <ShieldCheck size={14} />
                    <span>Private Individual Delivery</span>
                  </div>
                )}
              </div>

              <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {/* Templates Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-app-text-muted uppercase tracking-wider">
                      Select Email Template
                    </label>
                    <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                      <Sparkles size={11} />
                      World-class festive design
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => applyDiwaliTemplate(activeTargets)}
                      className={cn(
                        "px-3.5 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer",
                        selectedTemplate === 'diwali'
                          ? "bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 text-slate-950 ring-2 ring-amber-400/50 shadow-amber-500/20"
                          : "bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 hover:border-amber-500/60"
                      )}
                    >
                      <Sparkles size={14} className="fill-current" />
                      <span>🪔 Diwali Wishes & Additional 20% Voucher (DIWALI20)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPaymentTemplate(activeTargets)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer",
                        selectedTemplate === 'payment'
                          ? "bg-app-primary text-app-bg border-app-primary"
                          : "bg-app-bg border-app-primary/20 hover:border-app-primary/50 text-app-text"
                      )}
                    >
                      Payment Update
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMaintenanceTemplate(activeTargets)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer",
                        selectedTemplate === 'maintenance'
                          ? "bg-app-primary text-app-bg border-app-primary"
                          : "bg-app-bg border-app-primary/20 hover:border-app-primary/50 text-app-text"
                      )}
                    >
                      Maintenance Issue
                    </button>
                  </div>
                </div>

                {/* View Mode Toggle (Edit vs Preview) */}
                <div className="flex items-center justify-between border-b border-app-primary/10 pb-2 pt-1">
                  <div className="flex items-center gap-1 bg-app-bg p-1 rounded-xl border border-app-primary/10">
                    <button
                      type="button"
                      onClick={() => setEmailPreviewMode('edit')}
                      className={cn(
                        "px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer",
                        emailPreviewMode === 'edit'
                          ? "bg-app-primary text-app-bg"
                          : "text-app-text-muted hover:text-app-text"
                      )}
                    >
                      Edit Content
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmailPreviewMode('preview')}
                      className={cn(
                        "px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer",
                        emailPreviewMode === 'preview'
                          ? "bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 font-black shadow-sm"
                          : "text-app-text-muted hover:text-app-text"
                      )}
                    >
                      <Eye size={12} />
                      Preview Festive Email Design 🪔
                    </button>
                  </div>
                  {selectedTemplate === 'diwali' && (
                    <span className="text-[11px] font-bold text-amber-500 hidden sm:flex items-center gap-1">
                      <Sparkles size={12} />
                      Includes Golden DIWALI20 Voucher Card
                    </span>
                  )}
                </div>

                {emailPreviewMode === 'preview' ? (
                  /* World-Class Live Visual Email Preview */
                  <div className="bg-[#0f172a] border border-amber-500/30 rounded-2xl p-5 overflow-y-auto max-h-[360px] space-y-4 shadow-inner text-white custom-scrollbar">
                    {/* Header Banner */}
                    <div className="text-center pb-4 border-b border-white/10 bg-gradient-to-b from-[#1e1b4b] to-transparent p-4 rounded-xl">
                      <div className="text-2xl mb-1 tracking-widest">🪔 ✨ 🎆 ✨ 🪔</div>
                      <span className="text-[10px] font-black tracking-widest text-amber-400 uppercase bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/20">
                        Festival of Lights Special
                      </span>
                      <h2 className="text-xl font-black text-white mt-2">Happy Diwali!</h2>
                      <p className="text-xs text-amber-200/80 font-medium">May your learning journey shine brighter than ever</p>
                    </div>

                    {/* Greeting & Custom Message */}
                    <div className="text-xs text-slate-300 space-y-3 leading-relaxed px-2">
                      <p className="font-bold text-white text-sm">
                        Hi {activeTargets.length === 1 ? (activeTargets[0].displayName || 'Student') : 'PTE Aspirant'},
                      </p>
                      {emailBody.split('\n\n').map((para, idx) => (
                        <p key={idx} className="whitespace-pre-line text-slate-300 leading-relaxed">{para}</p>
                      ))}
                    </div>

                    {/* Golden Voucher Box */}
                    <div className="bg-gradient-to-br from-amber-500/20 via-orange-500/15 to-amber-600/20 border-2 border-dashed border-amber-400 rounded-2xl p-4 text-center my-3 shadow-lg">
                      <span className="text-[10px] font-black tracking-widest text-amber-300 uppercase">
                        ✨ Exclusive Festive Gift ✨
                      </span>
                      <div className="text-2xl font-black text-amber-300 mt-1">Get Additional 20% OFF</div>
                      <div className="text-xs font-bold text-amber-200/80">On All Plans (Weekly, Monthly & Annual)</div>
                      
                      <div className="inline-block bg-[#0f172a] border-2 border-amber-400 rounded-xl px-7 py-2.5 my-3 shadow-md">
                        <span className="font-mono text-2xl font-black tracking-widest text-amber-400">DIWALI20</span>
                      </div>
                      <div className="text-[11px] text-amber-200/70 font-semibold">Use code at checkout • Limited time Diwali offer</div>
                    </div>

                    {/* Highlights Box */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-slate-300 space-y-1.5">
                      <div className="font-black text-amber-400 text-[10px] uppercase tracking-wider mb-1">Why Top Scorers Choose PTE Ninja:</div>
                      <div>🎯 <strong>PTE-Calibrated AI Scoring:</strong> Real-time phoneme-level feedback</div>
                      <div>📚 <strong>5,000+ Real Exam Questions:</strong> High-frequency prediction bank</div>
                      <div>⚡ <strong>Full Mock Tests & Analytics:</strong> Instant scorecards with 79+ target tracker</div>
                    </div>

                    {/* Glowing CTA Button */}
                    <div className="text-center pt-2">
                      <div className="inline-block bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 text-slate-950 font-black text-xs px-7 py-3 rounded-full shadow-lg">
                        Claim Additional 20% OFF Now →
                      </div>
                    </div>

                    {/* Signoff */}
                    <div className="text-[11px] text-slate-400 pt-3 border-t border-white/10 text-center">
                      Wishing you a sparkling Diwali and boundless success,<br/>
                      <strong className="text-white">The PTE Ninja Team</strong> • <span className="text-amber-400">pteninja.com</span>
                    </div>
                  </div>
                ) : (
                  /* Edit Content Inputs */
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-app-text-muted uppercase tracking-wider">Subject Line</label>
                      <input
                        type="text"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        placeholder="Email subject..."
                        className="w-full bg-app-bg border border-app-primary/10 rounded-xl px-4 py-2.5 text-sm text-app-text focus:outline-none focus:border-app-primary/50 transition-colors font-medium"
                      />
                    </div>

                    <div className="space-y-1.5 flex-1 flex flex-col">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-app-text-muted uppercase tracking-wider">Message Content</label>
                        <span className="text-[10px] text-app-text-muted">Supports line breaks</span>
                      </div>
                      <textarea
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        placeholder="Type your message here..."
                        className="w-full bg-app-bg border border-app-primary/10 rounded-xl px-4 py-3 text-sm text-app-text focus:outline-none focus:border-app-primary/50 transition-colors resize-none h-44 leading-relaxed font-sans"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-between pt-5 mt-auto border-t border-app-primary/10">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEmailUser(null);
                    setEmailTargetUsers([]);
                  }}
                  disabled={isSendingEmail}
                  className="px-4 py-2 text-sm font-bold text-app-text-muted hover:text-app-text disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!emailSubject || !emailBody) {
                      toast.error("Please enter a subject and a message.");
                      return;
                    }
                    setIsSendingEmail(true);
                    try {
                      const token = await auth.currentUser?.getIdToken();
                      const res = await fetch('/api/admin/send-email', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({
                          recipients: activeTargets.map(u => ({ email: u.email, name: u.displayName })),
                          subject: emailSubject,
                          body: emailBody,
                          templateType: selectedTemplate || (emailSubject.toLowerCase().includes('diwali') ? 'diwali' : undefined),
                          promoCode: 'DIWALI20',
                          discountText: 'Additional 20% OFF'
                        })
                      });
                      
                      const data = await res.json();
                      if (res.ok) {
                        toast.success(
                          isBulk
                            ? `Successfully sent email to ${data.sentCount || activeTargets.length} users!`
                            : `Email sent successfully to ${activeTargets[0]?.email}!`
                        );
                        setSelectedEmailUser(null);
                        setEmailTargetUsers([]);
                        setEmailSubject('');
                        setEmailBody('');
                        setSelectedUserUids(new Set());
                      } else {
                        toast.error(data.error || "Failed to send email");
                      }
                    } catch (err) {
                      console.error("Error sending email:", err);
                      toast.error("Failed to send email");
                    } finally {
                      setIsSendingEmail(false);
                    }
                  }}
                  disabled={isSendingEmail || !emailSubject || !emailBody}
                  className="flex items-center gap-2 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 text-slate-950 px-6 py-2.5 rounded-xl text-sm font-black hover:brightness-110 shadow-lg transition-all disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {isSendingEmail ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} className="stroke-[2.5]" />}
                  {isSendingEmail 
                    ? `Sending to ${activeTargets.length} recipient${activeTargets.length > 1 ? 's' : ''}...`
                    : isBulk 
                      ? `Send Email to All ${activeTargets.length} Users` 
                      : 'Send Email'
                  }
                </button>
              </div>
            </motion.div>
          </div>
        );
      })()}
    </div>
  );
}

