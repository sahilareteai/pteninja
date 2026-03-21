import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Mic, 
  PenTool, 
  BookOpen, 
  Headphones, 
  Trophy, 
  Target, 
  ChevronRight, 
  Lock, 
  Play,
  Settings,
  User,
  BarChart3,
  Flame,
  Star,
  Shield,
  Clock,
  ArrowRight,
  Check,
  X,
  LogOut,
  CreditCard,
  ShieldCheck
} from 'lucide-react';
import { cn } from './lib/utils';
import { PTE_TASKS, PTESection, PTETask, UserProgress, SUBSCRIPTION_PLANS } from './types';
import { analyzeSpeaking, analyzeWriting, generateTTS } from './services/geminiService';
import { SubscriptionProvider, useSubscription } from './components/SubscriptionProvider';

// Mock Data for Initial State
const INITIAL_PROGRESS: UserProgress = {
  targetScore: 79,
  currentScore: 65,
  streak: 12,
  completedTasks: []
};

function AppContent() {
  const [activeTab, setActiveTab] = useState<PTESection | 'dashboard' | 'profile'>('dashboard');
  const [progress, setProgress] = useState<UserProgress>(INITIAL_PROGRESS);
  const [selectedTask, setSelectedTask] = useState<PTETask | null>(null);
  const { user, loading, login, continueAsGuest, logout, showSubscriptionModal, setShowSubscriptionModal, isAccessRestricted, authError, setAuthError } = useSubscription();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0C10] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#45A29E]/20 border-t-[#45A29E] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LandingPage onLogin={login} onGuest={continueAsGuest} authError={authError} onClearError={() => setAuthError(null)} />;
  }

  return (
    <div className="min-h-screen bg-[#0B0C10] text-[#C5C6C7] font-sans selection:bg-[#45A29E]/30">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#45A29E]/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#66FCF1]/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 flex flex-col h-screen">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[#1F2833] bg-[#0B0C10]/80 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#45A29E] rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(69,162,158,0.3)]">
              <Zap className="text-[#0B0C10] fill-current" size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tighter text-white font-display">
              PTE <span className="text-[#45A29E]">NINJA</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            {user && (
              <div className={cn(
                "hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest",
                user.subscriptionStatus === 'active' ? "text-green-500 bg-green-500/10 border-green-500/20" :
                user.subscriptionStatus === 'trial' ? "text-blue-500 bg-blue-500/10 border-blue-500/20" :
                "text-orange-500 bg-orange-500/10 border-orange-500/20"
              )}>
                <Shield size={12} className="fill-current" />
                {user.subscriptionStatus === 'active' ? 'Premium' : 
                 user.subscriptionStatus === 'trial' ? 'Trial' : 'Guest'}
              </div>
            )}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#1F2833] rounded-full border border-[#45A29E]/20">
              <Flame className="text-orange-500" size={16} />
              <span className="text-sm font-bold text-white">{progress.streak} DAY STREAK</span>
            </div>
            <button 
              onClick={() => setActiveTab('profile')}
              className="p-2 hover:bg-[#1F2833] rounded-full transition-colors"
            >
              <Settings size={20} />
            </button>
            <button 
              onClick={() => setActiveTab('profile')}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-[#45A29E] to-[#66FCF1] p-[2px]"
            >
              <div className="w-full h-full rounded-full bg-[#0B0C10] flex items-center justify-center overflow-hidden">
                {user?.displayName ? (
                  <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=45A29E&color=0B0C10`} alt="User" className="w-full h-full object-cover" />
                ) : (
                  <User size={20} className="text-[#45A29E]" />
                )}
              </div>
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' ? (
              <Dashboard key="dashboard" progress={progress} onStartTask={(task) => {
                setSelectedTask(task);
                setActiveTab(task.section);
              }} />
            ) : activeTab === 'profile' ? (
              <ProfileView 
                key="profile" 
                user={user} 
                onLogout={logout} 
                onUpgrade={() => setShowSubscriptionModal(true)}
              />
            ) : (
              <SectionView 
                key={activeTab} 
                section={activeTab} 
                onBack={() => setActiveTab('dashboard')} 
                onSelectTask={setSelectedTask}
              />
            )}
          </AnimatePresence>
        </main>

        {/* Navigation Bar */}
        <nav className="flex items-center justify-around px-4 py-3 border-t border-[#1F2833] bg-[#0B0C10]/90 backdrop-blur-xl">
          <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={BarChart3} label="Dojo" />
          <NavButton active={activeTab === 'speaking'} onClick={() => setActiveTab('speaking')} icon={Mic} label="Speaking" />
          <NavButton active={activeTab === 'writing'} onClick={() => setActiveTab('writing')} icon={PenTool} label="Writing" />
          <NavButton active={activeTab === 'reading'} onClick={() => setActiveTab('reading')} icon={BookOpen} label="Reading" />
          <NavButton active={activeTab === 'listening'} onClick={() => setActiveTab('listening')} icon={Headphones} label="Listening" />
        </nav>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {selectedTask && (
          <TaskModal key={selectedTask.id} task={selectedTask} onClose={() => setSelectedTask(null)} />
        )}
        {showSubscriptionModal && (
          <SubscriptionModal 
            key="subscription-modal"
            user={user}
            onClose={() => !isAccessRestricted && setShowSubscriptionModal(false)}
            onLogin={login}
            isAccessRestricted={isAccessRestricted}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LandingPage({ onLogin, onGuest, authError, onClearError }: { onLogin: () => void, onGuest: () => void, authError: string | null, onClearError: () => void }) {
  return (
    <div className="min-h-screen bg-[#0B0C10] text-[#C5C6C7] font-sans selection:bg-[#45A29E]/30 overflow-x-hidden">
      {/* Auth Error Toast */}
      <AnimatePresence>
        {authError && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-6"
          >
            <div className="bg-red-500/10 border border-red-500/20 backdrop-blur-xl p-4 rounded-2xl flex items-start gap-4 shadow-2xl shadow-red-500/10">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center shrink-0">
                <Shield size={20} className="text-red-500" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="text-sm font-bold text-white">Access Error</h4>
                <p className="text-xs text-red-200/70 leading-relaxed">{authError}</p>
              </div>
              <button 
                onClick={onClearError}
                className="p-1 hover:bg-white/5 rounded-lg transition-colors"
              >
                <X size={18} className="text-white/40" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#45A29E]/5 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-[#66FCF1]/5 blur-[150px] rounded-full" />
      </div>

      {/* Navbar */}
      <nav className="relative z-20 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-[#45A29E] rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(69,162,158,0.3)]">
            <Zap className="text-[#0B0C10] fill-current" size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tighter text-white font-display">
            PTE <span className="text-[#45A29E]">NINJA</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={onLogin} className="text-sm font-bold text-white hover:text-[#45A29E] transition-colors">Sign In</button>
          <button 
            onClick={onLogin}
            className="px-6 py-2.5 bg-[#45A29E] text-[#0B0C10] font-bold rounded-xl hover:bg-[#66FCF1] transition-all shadow-[0_0_20px_rgba(69,162,158,0.2)]"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative z-10 pt-20 pb-32 px-6 max-w-7xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="space-y-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1F2833] rounded-full border border-[#45A29E]/20 text-xs font-bold tracking-widest text-[#45A29E] uppercase">
            <Star size={14} className="fill-current" />
            The Ultimate AI PTE Trainer
          </div>
          <h2 className="text-6xl md:text-8xl font-black text-white tracking-tighter leading-[0.9]">
            MASTER THE PTE <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#45A29E] to-[#66FCF1]">WITH AI PRECISION</span>
          </h2>
          <p className="text-xl text-[#C5C6C7] max-w-2xl mx-auto leading-relaxed">
            Stop guessing your score. Get real-time AI feedback on your speaking, writing, reading, and listening. Practice with the most accurate PTE simulation available.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button 
              onClick={onLogin}
              className="group flex items-center gap-3 px-10 py-5 bg-[#45A29E] text-[#0B0C10] font-bold text-lg rounded-2xl hover:bg-[#66FCF1] transition-all shadow-[0_0_30px_rgba(69,162,158,0.3)]"
            >
              Start Training Now
              <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button 
              onClick={onGuest}
              className="px-10 py-5 bg-transparent border border-[#45A29E]/30 text-[#45A29E] font-bold text-lg rounded-2xl hover:bg-[#45A29E]/10 transition-all"
            >
              Try Guest Access
            </button>
          </div>
        </motion.div>
      </header>

      {/* Features Grid */}
      <section className="relative z-10 py-32 px-6 bg-[#0B0C10]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={Mic} 
              title="AI Speaking Analysis" 
              description="Get instant feedback on fluency, pronunciation, and content accuracy. Our AI detects hesitations and mispronounced words."
            />
            <FeatureCard 
              icon={PenTool} 
              title="Smart Writing Feedback" 
              description="Submit your essays and summaries for instant scoring. Improve your grammar, vocabulary, and structure with AI insights."
            />
            <FeatureCard 
              icon={Target} 
              title="Target Score Tracking" 
              description="Set your goal (65, 79, or 90) and track your progress through our specialized training modules."
            />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative z-10 py-32 px-6 border-y border-[#1F2833]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
          <StatItem value="98%" label="Accuracy Rate" />
          <StatItem value="50k+" label="Practice Tasks" />
          <StatItem value="15k+" label="Active Ninjas" />
          <StatItem value="24/7" label="AI Support" />
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-20 px-6 text-center border-t border-[#1F2833]">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 bg-[#45A29E] rounded-lg flex items-center justify-center">
              <Zap className="text-[#0B0C10] fill-current" size={18} />
            </div>
            <h1 className="text-xl font-bold tracking-tighter text-white">
              PTE <span className="text-[#45A29E]">NINJA</span>
            </h1>
          </div>
          <p className="text-sm text-[#C5C6C7]/50">© 2026 PTE Ninja. All rights reserved. Master your future.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="p-10 bg-[#1F2833] border border-[#45A29E]/10 rounded-3xl hover:border-[#45A29E]/40 transition-all group">
      <div className="w-14 h-14 bg-[#45A29E]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#45A29E] transition-colors">
        <Icon className="text-[#45A29E] group-hover:text-[#0B0C10]" size={28} />
      </div>
      <h3 className="text-2xl font-bold text-white mb-4">{title}</h3>
      <p className="text-[#C5C6C7] leading-relaxed">{description}</p>
    </div>
  );
}

function StatItem({ value, label }: { value: string, label: string }) {
  return (
    <div className="space-y-2">
      <div className="text-5xl font-black text-white tracking-tighter">{value}</div>
      <div className="text-sm font-bold text-[#45A29E] uppercase tracking-widest">{label}</div>
    </div>
  );
}

function SubscriptionModal({ user, onClose, onLogin, isAccessRestricted }: { user: any, onClose: () => void, onLogin: () => void, isAccessRestricted: boolean }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0B0C10]/95 backdrop-blur-xl overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-2xl bg-[#1F2833] border border-[#45A29E]/20 rounded-3xl p-8 shadow-2xl my-8"
      >
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.4)]">
            <ShieldCheck className="text-white" size={32} />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              {user?.subscriptionStatus === 'expired' ? 'Subscription Expired' : 'Upgrade to Pro'}
            </h2>
            <p className="text-[#C5C6C7] text-lg">Get unlimited access to all PTE practice materials</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full pt-4">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <div 
                key={plan.id}
                className="bg-[#0B0C10] border border-[#45A29E]/20 rounded-2xl p-6 flex flex-col items-center space-y-4 hover:border-[#45A29E] transition-all group cursor-pointer"
              >
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#66FCF1]">${plan.price}</span>
                  <span className="text-xs text-[#C5C6C7]/50">/{plan.interval}</span>
                </div>
                <ul className="text-xs text-[#C5C6C7] space-y-2 text-left w-full">
                  <li className="flex items-center gap-2"><Check size={12} className="text-[#45A29E]" /> Full Question Bank</li>
                  <li className="flex items-center gap-2"><Check size={12} className="text-[#45A29E]" /> AI Scoring</li>
                  <li className="flex items-center gap-2"><Check size={12} className="text-[#45A29E]" /> Detailed Feedback</li>
                </ul>
                <button className="w-full py-2 bg-[#45A29E] text-[#0B0C10] font-bold rounded-xl group-hover:bg-[#66FCF1] transition-all">
                  Select
                </button>
              </div>
            ))}
          </div>

          {user?.accessType === 'guest' && (
            <div className={cn(
              "w-full p-4 border rounded-2xl flex items-center gap-4 text-left transition-colors",
              isAccessRestricted 
                ? "bg-orange-500/10 border-orange-500/20" 
                : "bg-[#45A29E]/10 border-[#45A29E]/20"
            )}>
              <User className={isAccessRestricted ? "text-orange-500" : "text-[#45A29E]"} size={24} />
              <div>
                <p className={cn("font-bold", isAccessRestricted ? "text-orange-500" : "text-[#45A29E]")}>
                  {isAccessRestricted ? 'Guest Access Expired' : 'Guest Access Active'}
                </p>
                <p className="text-xs text-[#C5C6C7]">
                  {isAccessRestricted 
                    ? 'Sign up now to get a 14-day free trial!' 
                    : 'You have 3 days of free access. Sign up to save your progress!'}
                </p>
              </div>
              <button 
                onClick={onLogin}
                className={cn(
                  "ml-auto px-4 py-2 font-bold rounded-xl transition-all",
                  isAccessRestricted ? "bg-orange-500 text-white hover:bg-orange-600" : "bg-[#45A29E] text-[#0B0C10] hover:bg-[#66FCF1]"
                )}
              >
                Sign Up
              </button>
            </div>
          )}

          {!isAccessRestricted && (
            <button 
              onClick={onClose}
              className="text-[#C5C6C7]/50 hover:text-white transition-colors"
            >
              Maybe later
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function App() {
  return (
    <SubscriptionProvider>
      <AppContent />
    </SubscriptionProvider>
  );
}

function ProfileView({ user, onLogout, onUpgrade }: { user: any, onLogout: () => void, onUpgrade: () => void }) {
  const isTrial = user?.subscriptionStatus === 'trial';
  const isGuest = user?.subscriptionStatus === 'guest';
  const isActive = user?.subscriptionStatus === 'active';
  
  const getStatusColor = () => {
    if (isActive) return 'text-green-500 bg-green-500/10 border-green-500/20';
    if (isTrial) return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    if (isGuest) return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
    return 'text-red-500 bg-red-500/10 border-red-500/20';
  };

  const getRemainingDays = () => {
    const now = new Date();
    if (isTrial && user.trialEndsAt) {
      const diff = new Date(user.trialEndsAt).getTime() - now.getTime();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    if (isGuest) {
      const createdAt = new Date(user.createdAt);
      const expiresAt = new Date(createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);
      const diff = expiresAt.getTime() - now.getTime();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    return 0;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto space-y-8"
    >
      <div className="flex items-center gap-6 bg-[#1F2833] p-8 rounded-3xl border border-[#45A29E]/20">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#45A29E] to-[#66FCF1] p-1">
          <div className="w-full h-full rounded-full bg-[#0B0C10] flex items-center justify-center overflow-hidden">
            {user?.displayName ? (
              <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&size=128&background=45A29E&color=0B0C10`} alt="User" className="w-full h-full object-cover" />
            ) : (
              <User size={48} className="text-[#45A29E]" />
            )}
          </div>
        </div>
        <div className="flex-1">
          <h2 className="text-3xl font-bold text-white">{user?.displayName || 'Sensei'}</h2>
          <p className="text-[#C5C6C7]">{user?.email || 'Guest User'}</p>
          <div className="flex items-center gap-3 mt-3">
            <span className={cn("px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-widest", getStatusColor())}>
              {user?.subscriptionStatus}
            </span>
            {(isTrial || isGuest) && (
              <span className="text-xs text-[#C5C6C7]/50">
                {getRemainingDays()} days remaining
              </span>
            )}
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500/20 transition-all"
        >
          <LogOut size={24} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#1F2833] p-8 rounded-3xl border border-[#45A29E]/20 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <CreditCard className="text-[#45A29E]" /> Subscription
            </h3>
            {!isActive && (
              <button 
                onClick={onUpgrade}
                className="px-4 py-2 bg-[#45A29E] text-[#0B0C10] font-bold rounded-xl hover:bg-[#66FCF1] transition-all"
              >
                Upgrade
              </button>
            )}
          </div>
          
          <div className="space-y-4">
            <div className="p-4 bg-[#0B0C10] rounded-2xl border border-[#45A29E]/10">
              <p className="text-xs text-[#C5C6C7]/50 uppercase tracking-widest font-bold">Current Plan</p>
              <p className="text-lg font-bold text-white mt-1">
                {isActive ? `${user.planId?.toUpperCase()} Plan` : isTrial ? '14-Day Free Trial' : isGuest ? '3-Day Guest Access' : 'No Active Plan'}
              </p>
            </div>
            
            {isActive && (
              <div className="p-4 bg-[#0B0C10] rounded-2xl border border-[#45A29E]/10">
                <p className="text-xs text-[#C5C6C7]/50 uppercase tracking-widest font-bold">Next Billing Date</p>
                <p className="text-lg font-bold text-white mt-1">
                  {new Date(user.subscriptionEndsAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#1F2833] p-8 rounded-3xl border border-[#45A29E]/20 space-y-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="text-[#45A29E]" /> Account Security
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-[#0B0C10] rounded-2xl border border-[#45A29E]/10">
              <div>
                <p className="text-sm font-bold text-white">Email Verified</p>
                <p className="text-xs text-[#C5C6C7]/50">{user?.email ? 'Your email is verified' : 'Sign in to verify'}</p>
              </div>
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", user?.email ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500")}>
                {user?.email ? <Check size={14} /> : <X size={14} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function NavButton({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all duration-300 relative group",
        active ? "text-[#45A29E]" : "text-[#C5C6C7] hover:text-white"
      )}
    >
      <div className={cn(
        "p-2 rounded-xl transition-all",
        active ? "bg-[#45A29E]/10" : "group-hover:bg-[#1F2833]"
      )}>
        <Icon size={24} />
      </div>
      <span className="text-[10px] uppercase tracking-widest font-bold">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-indicator"
          className="absolute -bottom-3 w-1 h-1 bg-[#45A29E] rounded-full shadow-[0_0_8px_#45A29E]"
        />
      )}
    </button>
  );
}

function Dashboard({ progress, onStartTask }: { progress: UserProgress, onStartTask: (task: PTETask) => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto space-y-8"
    >
      {/* Progress Overview */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-[#1F2833] rounded-3xl p-8 border border-[#45A29E]/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Trophy size={120} />
          </div>
          <div className="relative z-10">
            <h2 className="text-sm font-bold text-[#45A29E] uppercase tracking-[0.2em] mb-2">Path to Mastery</h2>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-6xl font-black text-white">{progress.currentScore}</span>
              <span className="text-xl text-[#C5C6C7]">/ {progress.targetScore}</span>
            </div>
            <div className="w-full h-3 bg-[#0B0C10] rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(progress.currentScore / 90) * 100}%` }}
                className="h-full bg-gradient-to-r from-[#45A29E] to-[#66FCF1] shadow-[0_0_15px_rgba(69,162,158,0.5)]"
              />
            </div>
            <p className="mt-4 text-sm text-[#C5C6C7]">You are in the <span className="text-[#66FCF1] font-bold">Top 15%</span> of students this week.</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#45A29E] to-[#1F2833] rounded-3xl p-8 flex flex-col justify-between text-[#0B0C10]">
          <div>
            <Target size={32} className="mb-4" />
            <h3 className="text-xl font-bold leading-tight">Next Milestone: <br/>Black Belt</h3>
          </div>
          <button className="mt-6 w-full py-3 bg-[#0B0C10] text-[#45A29E] rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-white hover:text-black transition-all">
            View Roadmap
          </button>
        </div>
      </section>

      {/* Recommended Tasks */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="text-[#45A29E]" size={20} />
            Daily Shuriken
          </h2>
          <button className="text-sm text-[#45A29E] font-bold hover:underline">View All</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PTE_TASKS.slice(0, 4).map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onStartTask(task)} />
          ))}
        </div>
      </section>

      {/* Quick Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Fluency" value="78" color="text-[#66FCF1]" />
        <StatBox label="Grammar" value="62" color="text-orange-500" />
        <StatBox label="Vocab" value="84" color="text-[#66FCF1]" />
        <StatBox label="Pronunc." value="71" color="text-yellow-500" />
      </section>
    </motion.div>
  );
}

function SectionView({ section, onBack, onSelectTask }: { section: PTESection, onBack: () => void, onSelectTask: (task: PTETask) => void }) {
  const tasks = PTE_TASKS.filter(t => t.section === section);
  
  const sectionInfo = {
    speaking: { icon: Mic, color: 'text-[#45A29E]', bg: 'bg-[#45A29E]/10' },
    writing: { icon: PenTool, color: 'text-purple-400', bg: 'bg-purple-400/10' },
    reading: { icon: BookOpen, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    listening: { icon: Headphones, color: 'text-orange-400', bg: 'bg-orange-400/10' },
  };

  const Icon = sectionInfo[section].icon;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 hover:bg-[#1F2833] rounded-full transition-colors">
          <ChevronRight className="rotate-180" />
        </button>
        <div className={cn("p-3 rounded-2xl", sectionInfo[section].bg)}>
          <Icon className={sectionInfo[section].color} size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white capitalize">{section} Dojo</h2>
          <p className="text-sm text-[#C5C6C7]">{tasks.length} specialized training modules</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} onClick={() => onSelectTask(task)} />
        ))}
      </div>
    </motion.div>
  );
}

function TaskCard({ task, onClick }: { task: PTETask, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-4 p-5 bg-[#1F2833] border border-[#45A29E]/5 rounded-2xl hover:border-[#45A29E]/40 transition-all group text-left"
    >
      <div className="w-12 h-12 rounded-xl bg-[#0B0C10] flex items-center justify-center group-hover:bg-[#45A29E] transition-colors">
        <Play size={20} className="text-[#45A29E] group-hover:text-[#0B0C10]" />
      </div>
      <div className="flex-1">
        <h4 className="font-bold text-white group-hover:text-[#66FCF1] transition-colors">{task.title}</h4>
        <p className="text-xs text-[#C5C6C7] line-clamp-1">{task.description}</p>
      </div>
      <ChevronRight size={16} className="text-[#45A29E] opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

function StatBox({ label, value, color }: { label: string, value: string, color: string }) {
  return (
    <div className="bg-[#1F2833] p-4 rounded-2xl border border-[#45A29E]/5 flex flex-col items-center">
      <span className="text-xs font-bold text-[#C5C6C7] uppercase tracking-widest mb-1">{label}</span>
      <span className={cn("text-2xl font-black", color)}>{value}</span>
    </div>
  );
}

function TaskModal({ task, onClose }: { task: PTETask, onClose: () => void }) {
  const [phase, setPhase] = useState<'prep' | 'audio' | 'recording' | 'analyzing' | 'feedback'>(
    task.hasAudio ? 'audio' : (task.prepTime === 0 ? 'recording' : 'prep')
  );
  const [timeLeft, setTimeLeft] = useState(
    task.hasAudio ? 0 : (task.prepTime === 0 ? (task.recordingTime ?? 10) : (task.prepTime ?? 35))
  );
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Audio logic
  useEffect(() => {
    let isCancelled = false;
    if (phase === 'audio') {
      const playAudio = async () => {
        setIsAudioPlaying(true);
        try {
          const base64 = await generateTTS(task.prompt || "");
          if (isCancelled) return;
          if (base64) {
            const audio = new Audio(`data:audio/wav;base64,${base64}`);
            audioRef.current = audio;
            audio.onended = () => {
              if (isCancelled) return;
              setIsAudioPlaying(false);
              if (task.prepTime && task.prepTime > 0) {
                setPhase('prep');
                setTimeLeft(task.prepTime);
              } else {
                setPhase('recording');
                setTimeLeft(task.recordingTime ?? 15);
              }
            };
            audio.play();
          } else {
            setIsAudioPlaying(false);
            setPhase(task.prepTime && task.prepTime > 0 ? 'prep' : 'recording');
            setTimeLeft(task.prepTime && task.prepTime > 0 ? task.prepTime : (task.recordingTime ?? 15));
          }
        } catch (err) {
          console.error("TTS failed:", err);
          setIsAudioPlaying(false);
          setPhase(task.prepTime && task.prepTime > 0 ? 'prep' : 'recording');
          setTimeLeft(task.prepTime && task.prepTime > 0 ? task.prepTime : (task.recordingTime ?? 15));
        }
      };
      playAudio();
    }
    return () => {
      isCancelled = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [phase, task.id]);

  // Recording logic
  useEffect(() => {
    if (phase === 'recording' && task.section === 'speaking') {
      startRecording();
    }
    return () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    };
  }, [phase]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      recorder.start();
      setMediaRecorder(recorder);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const getAudioBase64 = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (chunksRef.current.length === 0) {
        reject(new Error("No audio chunks recorded"));
        return;
      }
      const blob = new Blob(chunksRef.current, { type: mediaRecorder?.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const base64data = (reader.result as string).split(',')[1];
        resolve(base64data);
      };
      reader.onerror = reject;
    });
  };

  // Timer logic
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (phase === 'prep' || phase === 'recording') {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (phase === 'prep') {
              setPhase('recording');
              return task.recordingTime ?? 40;
            } else {
              handleFinish();
              return 0;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [phase, task.recordingTime]);

  const handleFinish = async () => {
    setPhase('analyzing');
    
    try {
      let result;
      if (task.section === 'speaking') {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          const stopPromise = new Promise(resolve => {
            mediaRecorder.onstop = resolve;
          });
          mediaRecorder.stop();
          await stopPromise;
        }
        const base64 = await getAudioBase64();
        if (!base64 || base64.length < 100) {
           throw new Error("No audio detected");
        }
        result = await analyzeSpeaking(base64, task.title, mediaRecorder?.mimeType || 'audio/webm');
      } else {
        if (!userInput.trim()) {
           throw new Error("No text provided");
        }
        result = await analyzeWriting(userInput, task.title);
      }
      
      const tips = result.tips || result.feedback || ["Keep practicing!"];
      const mispronounced = result.mispronounced || [];
      
      setFeedback({
        overall: result.overall || result.Score || 70,
        content: result.content || result.Content || 70,
        oralFluency: result.fluency || result.Fluency || result.oralFluency || 70,
        pronunciation: result.pronunciation || result.Pronunciation || 70,
        details: {
          hesitations: result.hesitations || 0,
          mispronounced: Array.isArray(mispronounced) ? mispronounced : [mispronounced],
          pace: result.pace || "Good",
          stress: result.stress || "Good"
        },
        tips: Array.isArray(tips) ? tips : [tips]
      });
      setPhase('feedback');
    } catch (error) {
      console.error("Analysis failed:", error);
      setFeedback({
        overall: 10,
        content: 10,
        oralFluency: 10,
        pronunciation: 10,
        details: { hesitations: 0, mispronounced: [], pace: "N/A", stress: "N/A" },
        tips: [error instanceof Error ? error.message : "Analysis failed. Please try again."]
      });
      setPhase('feedback');
    }
  };

  const skipPrep = () => {
    setPhase('recording');
    setTimeLeft(task.recordingTime ?? 40);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0C10]/95 backdrop-blur-sm overflow-y-auto"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-[#1F2833] w-full max-w-2xl rounded-3xl border border-[#45A29E]/20 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] my-auto"
      >
        {/* Header */}
        <div className="p-6 border-b border-[#1F2833] flex items-center justify-between bg-[#1F2833]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#45A29E]/10 rounded-lg">
              {task.section === 'speaking' ? <Mic className="text-[#45A29E]" size={20} /> : <PenTool className="text-[#45A29E]" size={20} />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-none">{task.title}</h3>
              <p className="text-[10px] text-[#45A29E] uppercase tracking-widest mt-1 font-bold">PTE Academic Standard</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#0B0C10] rounded-full transition-colors text-[#C5C6C7]">
            <ChevronRight className="rotate-90" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {/* Status Bar */}
          {(phase === 'prep' || phase === 'recording' || phase === 'audio') && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  phase === 'prep' ? "bg-yellow-500" : (phase === 'audio' ? "bg-blue-500" : "bg-red-500")
                )} />
                <span className="text-xs font-bold uppercase tracking-widest text-white">
                  {phase === 'audio' ? "Listening" : (phase === 'prep' ? "Preparation" : (task.section === 'speaking' ? "Recording" : "Writing"))}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-2xl font-mono font-bold text-white">
                  {phase === 'audio' ? "---" : formatTime(timeLeft)}
                </div>
                {phase === 'prep' && (
                  <button 
                    onClick={skipPrep}
                    className="text-[10px] font-bold text-[#45A29E] border border-[#45A29E]/30 px-3 py-1 rounded-full hover:bg-[#45A29E]/10 transition-all"
                  >
                    SKIP PREP
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Prompt Area */}
          <div className="bg-[#0B0C10] p-8 rounded-2xl border border-[#45A29E]/10 relative group">
            <p className="text-xl text-white leading-relaxed font-medium">
              {/* Hide prompt for audio-based tasks during audio phase */}
              {((task.id === 'rs' || task.id === 'wfd' || task.id === 'rl' || task.id === 'sgd') && phase === 'audio') 
                ? (task.id === 'rs' || task.id === 'wfd' ? "Listen carefully to the sentence..." : "Listen carefully to the recording...") 
                : (task.prompt || "No prompt available for this task.")}
            </p>
            {task.image && (
              <div className="mt-6 rounded-xl overflow-hidden border border-[#45A29E]/20">
                <img 
                  src={task.image} 
                  alt="Task Prompt" 
                  className="w-full h-auto object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
          </div>

          {/* Input Area (Writing, Reading, Listening) */}
          {task.section !== 'speaking' && phase === 'recording' && (
            <div className="space-y-4">
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={task.section === 'listening' ? "Type what you hear..." : "Type your response here..."}
                className="w-full h-48 bg-[#0B0C10] text-white p-6 rounded-2xl border border-[#45A29E]/20 focus:border-[#45A29E] outline-none transition-all resize-none"
              />
              <div className="flex justify-between items-center">
                <div className="flex gap-4">
                  <span className="text-xs text-[#C5C6C7]">Word count: {userInput.trim().split(/\s+/).filter(Boolean).length}</span>
                  {task.section === 'listening' && (
                    <span className="text-xs text-[#45A29E] font-bold animate-pulse">Audio Playing...</span>
                  )}
                </div>
                <button 
                  onClick={handleFinish}
                  className="bg-[#45A29E] text-[#0B0C10] px-6 py-2 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-[#66FCF1] transition-all"
                >
                  Submit Response
                </button>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {phase === 'analyzing' ? (
              <motion.div 
                key="analyzing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 space-y-6"
              >
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-[#45A29E]/20 border-t-[#45A29E] rounded-full animate-spin" />
                  <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#45A29E]" size={32} />
                </div>
                <div className="text-center">
                  <h4 className="text-xl font-bold text-white mb-2">Sensei AI is Scoring...</h4>
                  <p className="text-sm text-[#C5C6C7]">Analyzing fluency, pronunciation, and content accuracy.</p>
                </div>
              </motion.div>
            ) : phase === 'feedback' ? (
              <motion.div 
                key="feedback"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Scoreboard */}
                <div className="bg-[#0B0C10] rounded-3xl p-6 border border-[#45A29E]/20">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h4 className="text-sm font-bold text-[#45A29E] uppercase tracking-widest">Ninja Scoreboard</h4>
                      <p className="text-xs text-[#C5C6C7]">Based on PTE Global Scale of English</p>
                    </div>
                    <div className="text-5xl font-black text-[#66FCF1] drop-shadow-[0_0_10px_rgba(102,252,241,0.3)]">
                      {feedback.overall}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <ScoreMetric label="Content" score={feedback.content} max={90} />
                    <ScoreMetric label="Oral Fluency" score={feedback.oralFluency} max={90} />
                    <ScoreMetric label="Pronunciation" score={feedback.pronunciation} max={90} />
                  </div>
                </div>

                {/* Detailed Analysis */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#1F2833] p-4 rounded-2xl border border-white/5">
                    <h5 className="text-[10px] font-bold text-[#C5C6C7] uppercase mb-3">Diagnostic Data</h5>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span>Hesitations</span>
                        <span className="text-orange-400 font-bold">{feedback.details.hesitations}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Pace</span>
                        <span className="text-[#66FCF1] font-bold">{feedback.details.pace}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#1F2833] p-4 rounded-2xl border border-white/5">
                    <h5 className="text-[10px] font-bold text-[#C5C6C7] uppercase mb-3">Mispronounced</h5>
                    <div className="flex flex-wrap gap-1">
                      {Array.isArray(feedback.details.mispronounced) && feedback.details.mispronounced.map((word: string) => (
                        <span key={word} className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded-md border border-red-500/20">
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tips */}
                <div className="bg-[#45A29E]/5 p-6 rounded-2xl border border-[#45A29E]/20">
                  <h5 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <Zap size={16} className="text-[#45A29E]" />
                    Sensei's Wisdom
                  </h5>
                  <ul className="space-y-3">
                    {Array.isArray(feedback.tips) && feedback.tips.map((tip: string, i: number) => (
                      <li key={i} className="text-xs text-[#C5C6C7] flex gap-3 leading-relaxed">
                        <span className="text-[#45A29E] font-bold">0{i+1}</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setFeedback(null);
                      setPhase('prep');
                      setTimeLeft(35);
                    }}
                    className="flex-1 py-4 bg-[#45A29E] text-[#0B0C10] rounded-2xl font-bold uppercase tracking-widest hover:bg-[#66FCF1] transition-all"
                  >
                    Retrain
                  </button>
                  <button 
                    onClick={onClose}
                    className="flex-1 py-4 border border-[#45A29E]/20 text-white rounded-2xl font-bold uppercase tracking-widest hover:bg-white/5 transition-all"
                  >
                    Next Task
                  </button>
                </div>
              </motion.div>
            ) : task.section === 'speaking' || phase === 'prep' || phase === 'audio' ? (
              <motion.div 
                key="active"
                className="flex flex-col items-center py-8"
              >
                {(phase === 'recording' && task.section === 'speaking') || phase === 'audio' ? (
                  <>
                    <div className="w-full h-24 flex items-center justify-center gap-1 mb-4">
                      {[...Array(20)].map((_, i) => (
                        <motion.div 
                          key={i}
                          animate={phase === 'audio' 
                            ? { height: [10, Math.random() * 40 + 10, 10] } 
                            : { height: [10, Math.random() * 60 + 10, 10] }
                          }
                          transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.05 }}
                          className={cn(
                            "w-1.5 rounded-full",
                            phase === 'audio' ? "bg-blue-400" : "bg-[#45A29E]"
                          )}
                        />
                      ))}
                    </div>
                    <p className="text-sm text-[#C5C6C7] animate-pulse mb-8">
                      {phase === 'audio' ? "Listening to audio..." : "Recording your response..."}
                    </p>
                  </>
                ) : null}
                
                <button 
                  disabled={phase === 'audio'}
                  onClick={phase === 'recording' ? handleFinish : skipPrep}
                  className={cn(
                    "w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl",
                    phase === 'recording' ? "bg-red-500 shadow-red-500/20" : (phase === 'audio' ? "bg-blue-500/50 cursor-not-allowed" : "bg-[#45A29E] shadow-[#45A29E]/20")
                  )}
                >
                  {phase === 'recording' ? <div className="w-8 h-8 bg-white rounded-sm" /> : (phase === 'audio' ? <Headphones size={40} className="text-white" /> : <Play size={40} className="text-[#0B0C10] ml-1" />)}
                </button>
                <p className="mt-6 text-xs font-bold text-[#C5C6C7] uppercase tracking-[0.3em]">
                  {phase === 'audio' ? "Listening..." : (phase === 'prep' ? "Preparing..." : (task.section === 'speaking' ? "Recording Now" : "Starting Task"))}
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ScoreMetric({ label, score, max }: { label: string, score: number, max: number }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-[10px] font-bold text-[#C5C6C7] uppercase tracking-wider">{label}</span>
        <span className="text-sm font-bold text-white">{score}</span>
      </div>
      <div className="h-1.5 bg-[#1F2833] rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${(score / max) * 100}%` }}
          className="h-full bg-[#45A29E]"
        />
      </div>
    </div>
  );
}


