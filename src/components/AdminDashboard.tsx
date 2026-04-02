import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  Ticket, 
  Settings, 
  Search, 
  CheckCircle, 
  XCircle, 
  Plus, 
  Trash2, 
  ChevronRight,
  Shield,
  CreditCard,
  Clock,
  Mail,
  User as UserIcon,
  Loader2
} from 'lucide-react';
import { db, collection, getDocs, getDoc, doc, updateDoc, setDoc, query, where, OperationType, handleFirestoreError, auth } from '../firebase';
import { UserData, SUBSCRIPTION_PLANS } from '../types';
import { PromoCode } from '../services/promoService';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

interface AdminUser extends UserData {
  uid: string;
}

export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'users' | 'promoCodes'>('users');
  const [userFilter, setUserFilter] = useState<'all' | 'paid' | 'guests'>('all');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingPromo, setIsAddingPromo] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [newPromo, setNewPromo] = useState<PromoCode>({
    code: '',
    discountPercent: 10,
    description: '',
    isActive: true
  });

  useEffect(() => {
    fetchData();
    seedInitialCodes();
  }, [activeTab]);

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
      // Don't throw here to avoid crashing the dashboard, but log it
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'users') {
        const querySnapshot = await getDocs(collection(db, 'users'));
        const usersList: AdminUser[] = [];
        querySnapshot.forEach((doc) => {
          usersList.push({ uid: doc.id, ...doc.data() } as AdminUser);
        });
        setUsers(usersList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      } else {
        const querySnapshot = await getDocs(collection(db, 'promoCodes'));
        const promoList: PromoCode[] = [];
        querySnapshot.forEach((doc) => {
          promoList.push(doc.data() as PromoCode);
        });
        setPromoCodes(promoList);
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

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-app-bg/95 backdrop-blur-xl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-6xl h-[85vh] bg-app-surface border border-app-primary/20 rounded-3xl flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="p-6 border-b border-app-primary/10 flex items-center justify-between bg-app-surface/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-app-primary/10 rounded-xl flex items-center justify-center text-app-primary">
              <Shield size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-app-text">Admin Dashboard</h2>
              <p className="text-xs text-app-text-muted">Manage users and promotions</p>
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
        <div className="flex border-b border-app-primary/10 px-6">
          <button 
            onClick={() => setActiveTab('users')}
            className={cn(
              "px-6 py-4 text-sm font-bold transition-all border-b-2",
              activeTab === 'users' ? "border-app-primary text-app-primary" : "border-transparent text-app-text-muted hover:text-app-text"
            )}
          >
            <div className="flex items-center gap-2">
              <Users size={18} />
              Users
            </div>
          </button>
          <button 
            onClick={() => setActiveTab('promoCodes')}
            className={cn(
              "px-6 py-4 text-sm font-bold transition-all border-b-2",
              activeTab === 'promoCodes' ? "border-app-primary text-app-primary" : "border-transparent text-app-text-muted hover:text-app-text"
            )}
          >
            <div className="flex items-center gap-2">
              <Ticket size={18} />
              Promo Codes
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
              <Loader2 className="animate-spin text-app-primary" size={40} />
              <p className="text-app-text-muted animate-pulse">Loading data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {activeTab === 'users' ? (
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

                    <div className="flex items-center gap-2 bg-app-bg p-1 rounded-xl border border-app-primary/10">
                      <button 
                        onClick={() => setUserFilter('all')}
                        className={cn(
                          "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                          userFilter === 'all' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text"
                        )}
                      >
                        All ({users.length})
                      </button>
                      <button 
                        onClick={() => setUserFilter('paid')}
                        className={cn(
                          "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                          userFilter === 'paid' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text"
                        )}
                      >
                        Paid ({paidCount})
                      </button>
                      <button 
                        onClick={() => setUserFilter('guests')}
                        className={cn(
                          "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                          userFilter === 'guests' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text"
                        )}
                      >
                        Guests ({guestCount})
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
                              <span className={cn(
                                "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
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
                              <span className={cn(
                                "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                user.role === 'admin' ? "bg-purple-500/10 text-purple-500" : "bg-app-text-muted/10 text-app-text-muted"
                              )}>
                                {user.role || 'user'}
                              </span>
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
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-app-text">Manage Promo Codes</h3>
                    <button 
                      onClick={() => setIsAddingPromo(true)}
                      className="flex items-center gap-2 bg-app-primary text-app-bg px-4 py-2 rounded-xl text-sm font-bold hover:bg-app-accent transition-all"
                    >
                      <Plus size={18} />
                      Add New Code
                    </button>
                  </div>

                  {isAddingPromo && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-app-bg border border-app-primary/20 rounded-2xl p-6 space-y-4"
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
                      <div 
                        key={promo.code}
                        className="bg-app-bg border border-app-primary/10 rounded-2xl p-6 flex flex-col space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Ticket className="text-app-primary" size={20} />
                            <span className="text-lg font-bold text-app-text">{promo.code}</span>
                          </div>
                          <button 
                            onClick={() => togglePromoStatus(promo)}
                            className={cn(
                              "p-2 rounded-xl transition-all",
                              promo.isActive ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                            )}
                          >
                            {promo.isActive ? <CheckCircle size={20} /> : <XCircle size={20} />}
                          </button>
                        </div>
                        <div className="space-y-1">
                          <div className="text-2xl font-bold text-app-accent">{promo.discountPercent}% OFF</div>
                          <p className="text-xs text-app-text-muted">{promo.description}</p>
                        </div>
                        <div className="pt-4 border-t border-app-primary/5 flex items-center justify-between">
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest",
                            promo.isActive ? "text-green-500" : "text-red-500"
                          )}>
                            {promo.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
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
