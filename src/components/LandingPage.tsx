import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, X, Sun, Moon, Star, ArrowRight, Mic, PenTool, Target, ShieldCheck, CheckCircle, Clock, Zap, MessageSquare, Award, PlayCircle, Quote } from 'lucide-react';
import { Logo } from './Logo';
import { PrivacyPolicy } from './PrivacyPolicy';
import { TermsOfService } from './TermsOfService';
import { POLICIES } from '../data/policies';
import { ScrollNinja } from './ScrollNinja';
import { DiwaliBanner } from './DiwaliBanner';
import { isNativeMobile, isIOS } from '../lib/mobile';

export function PolicyModal({ type, onClose }: { type: keyof typeof POLICIES, onClose: () => void }) {
  const policy = POLICIES[type];
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 bg-app-bg/95 backdrop-blur-xl overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-3xl bg-app-surface border border-app-primary/20 rounded-3xl p-8 shadow-2xl my-auto relative"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full transition-colors"
        >
          <X size={24} className="text-app-text-muted hover:text-app-primary" />
        </button>
        
        <div className="space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-app-primary/10 rounded-2xl flex items-center justify-center">
              <ShieldCheck className="text-app-primary" size={28} />
            </div>
            <h2 className="text-3xl font-bold text-app-text tracking-tight">{policy.title}</h2>
          </div>
          
          <div 
            className="text-app-text-muted leading-relaxed space-y-4 prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: policy.content }}
          />
          
          <div className="pt-8 border-t border-app-border flex justify-end">
            <button 
              onClick={onClose}
              className="px-8 py-3 bg-app-primary text-app-bg font-bold rounded-xl hover:bg-app-accent transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const itemVariant = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <motion.div 
      variants={itemVariant}
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      className="p-10 bg-app-surface/50 backdrop-blur-md border border-app-primary/10 rounded-3xl hover:border-app-primary/40 hover:bg-app-surface transition-all group shadow-lg hover:shadow-app-primary/10"
    >
      <div className="w-14 h-14 bg-app-primary/10 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-app-primary transition-colors">
        <Icon className="text-app-primary group-hover:text-app-bg" size={28} />
      </div>
      <h3 className="text-2xl font-bold text-app-text mb-4">{title}</h3>
      <p className="text-app-text-muted leading-relaxed">{description}</p>
    </motion.div>
  );
}

function StatItem({ value, label }: { value: string, label: string }) {
  return (
    <div className="space-y-2">
      <div className="text-5xl font-black text-app-text tracking-tighter">{value}</div>
      <div className="text-sm font-bold text-app-primary uppercase tracking-widest">{label}</div>
    </div>
  );
}

export function LandingPage({ onLogin, onGuest, authError, onClearError, isDarkMode, setIsDarkMode }: { 
  onLogin: (mode?: 'signin' | 'register') => void, 
  onGuest: () => void, 
  authError: string | null, 
  onClearError: () => void,
  isDarkMode: boolean,
  setIsDarkMode: (val: boolean) => void
}) {
  const [activePolicy, setActivePolicy] = useState<keyof typeof POLICIES | null>(null);
  const [isDiwaliBannerVisible, setIsDiwaliBannerVisible] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const policy = params.get('policy');
    if (policy === 'privacy' || policy === 'terms' || policy === 'disclaimer' || policy === 'refund') {
      setActivePolicy(policy as keyof typeof POLICIES);
    }
  }, []);

  return (
    <div className="min-h-screen bg-app-bg text-app-text-muted font-sans selection:bg-app-primary/30 overflow-x-hidden transition-colors duration-300">
      <DiwaliBanner
        onClaim={() => onLogin('register')}
        onVisibilityChange={setIsDiwaliBannerVisible}
      />
      <ScrollNinja onClaim={() => onLogin('register')} />
      <AnimatePresence>
        {activePolicy === 'privacy' ? (
          <div className="fixed inset-0 z-[150] bg-app-bg overflow-y-auto">
            <PrivacyPolicy onBack={() => setActivePolicy(null)} />
          </div>
        ) : activePolicy === 'terms' ? (
          <div className="fixed inset-0 z-[150] bg-app-bg overflow-y-auto">
            <TermsOfService onBack={() => setActivePolicy(null)} />
          </div>
        ) : activePolicy && (
          <PolicyModal type={activePolicy} onClose={() => setActivePolicy(null)} />
        )}
      </AnimatePresence>
      {/* Auth Error Toast */}
      <AnimatePresence>
        {authError && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-6"
          >
            <div className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800/50 p-4 rounded-2xl flex items-start gap-4 shadow-2xl shadow-red-500/10">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center shrink-0">
                <Shield size={20} className="text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">Access Error</h4>
                <p className="text-xs text-red-600 dark:text-red-300 leading-relaxed whitespace-pre-wrap">
                  {authError.split(/(https?:\/\/[^\s]+)/g).map((part, i) => 
                    part.match(/^https?:\/\//) ? (
                      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-red-700 dark:text-red-200 font-bold underline hover:text-app-primary transition-colors">
                        {part}
                      </a>
                    ) : part
                  )}
                </p>
              </div>
              <button 
                onClick={onClearError}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X size={18} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Background Glows and Abstract Shapes (Hardware-Accelerated for Desktop 60 FPS) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none transform-gpu z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[65vw] h-[65vw] bg-[radial-gradient(circle_at_center,_var(--color-app-primary)_0%,_transparent_65%)] opacity-15 rounded-full pointer-events-none transform-gpu will-change-transform" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[65vw] h-[65vw] bg-[radial-gradient(circle_at_center,_var(--color-app-accent)_0%,_transparent_65%)] opacity-10 rounded-full pointer-events-none transform-gpu will-change-transform" />
      </div>

      {/* Navbar */}
      <nav
        style={{
          paddingTop: isDiwaliBannerVisible ? undefined : 'calc(env(safe-area-inset-top, 0px) + 1.5rem)',
        }}
        className="relative z-20 flex items-center justify-between px-4 sm:px-8 py-6 max-w-7xl mx-auto transition-all duration-200"
      >
        <Logo showText={true} size={40} className="shadow-[0_0_20px_rgba(var(--app-primary-rgb),0.3)]" />
        <div className="flex items-center gap-2 sm:gap-6 bg-app-surface/50 backdrop-blur-md px-4 py-2 rounded-full border border-app-border">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 hover:bg-app-surface rounded-full transition-colors text-app-text-muted hover:text-app-primary"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button onClick={() => onLogin('signin')} className="hidden sm:block text-sm font-bold text-app-text hover:text-app-primary transition-colors">Sign In</button>
          <button 
            onClick={() => onLogin('register')}
            className="px-4 sm:px-6 py-2 sm:py-2 bg-app-primary text-app-bg font-bold text-sm sm:text-base rounded-full hover:bg-app-accent transition-all shadow-[0_0_20px_rgba(var(--app-primary-rgb),0.2)]"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative z-10 pt-20 pb-24 px-6 max-w-7xl mx-auto text-center">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { staggerChildren: 0.15 } }
          }}
          className="space-y-8"
        >
          <motion.div 
            variants={itemVariant} 
            whileHover={{ scale: 1.04 }}
            className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-app-surface/80 border border-app-primary/30 backdrop-blur-xl shadow-[0_0_20px_rgba(var(--app-primary-rgb),0.15)] text-xs font-extrabold tracking-[0.2em] text-app-primary uppercase cursor-default transition-all duration-300"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-app-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-app-primary"></span>
            </span>
            <span>The Ultimate AI PTE Trainer</span>
          </motion.div>
          <motion.h2 variants={itemVariant} className="text-6xl md:text-8xl font-black text-app-text tracking-tighter leading-[0.9]">
            MASTER THE PTE <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-app-primary to-app-accent">WITH AI PRECISION</span>
          </motion.h2>
          <motion.p variants={itemVariant} className="text-xl text-app-text-muted max-w-2xl mx-auto leading-relaxed">
            Stop guessing your score. Get real-time AI feedback on your speaking, writing, reading, and listening. Practice with the most accurate PTE simulation available.
          </motion.p>
          <motion.div variants={itemVariant} className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
            <button 
              onClick={() => onLogin('register')}
              className="group flex items-center justify-center gap-3 w-full sm:w-auto px-10 py-5 bg-gradient-to-r from-app-primary to-app-accent text-app-bg font-bold text-lg rounded-2xl hover:scale-105 transition-all shadow-[0_0_40px_rgba(var(--app-primary-rgb),0.6)]"
            >
              Start Training Now
              <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button 
              onClick={onGuest}
              className="w-full sm:w-auto px-10 py-5 bg-app-surface/50 backdrop-blur-md border border-app-primary/30 text-app-primary font-bold text-lg rounded-2xl hover:bg-app-primary/10 transition-all"
            >
              Try Guest Access for Free
            </button>
          </motion.div>
        </motion.div>
      </header>

      {/* Infinite Marquee Section */}
      <section className="relative z-10 py-10 border-y border-white/[0.03] bg-black/10 backdrop-blur-sm overflow-hidden flex flex-col items-center">
        <p className="text-[10px] font-bold text-app-text-muted uppercase tracking-[0.2em] mb-6 text-center">PTE scores accepted by top universities including:</p>
        <div className="relative w-full flex items-center">
          <div className="absolute left-0 top-0 w-32 h-full bg-gradient-to-r from-app-bg to-transparent z-10" />
          <div className="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-app-bg to-transparent z-10" />
          <motion.div 
            className="flex whitespace-nowrap gap-16 md:gap-32 items-center px-8"
            animate={{ x: [0, -2000] }}
            transition={{ repeat: Infinity, duration: 40, ease: "linear" }}
          >
          {/* Repeat twice for seamless infinite scroll */}
          {[...Array(2)].map((_, i) => (
            <React.Fragment key={i}>
              <div className="flex items-center gap-3 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-default"><Award size={24} className="text-app-text"/><span className="text-xl font-bold text-app-text tracking-wide uppercase">University of Sydney</span></div>
              <div className="flex items-center gap-3 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-default"><Award size={24} className="text-app-text"/><span className="text-xl font-bold text-app-text tracking-wide uppercase">Monash University</span></div>
              <div className="flex items-center gap-3 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-default"><Award size={24} className="text-app-text"/><span className="text-xl font-bold text-app-text tracking-wide uppercase">UNSW Sydney</span></div>
              <div className="flex items-center gap-3 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-default"><Award size={24} className="text-app-text"/><span className="text-xl font-bold text-app-text tracking-wide uppercase">University of Melbourne</span></div>
              <div className="flex items-center gap-3 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-default"><Award size={24} className="text-app-text"/><span className="text-xl font-bold text-app-text tracking-wide uppercase">Australian National University</span></div>
            </React.Fragment>
          ))}
          </motion.div>
        </div>
      </section>

      {/* Global Opportunities Section */}
      <section className="relative z-10 py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-8 md:p-12 bg-gradient-to-br from-app-surface/80 to-app-surface/40 backdrop-blur-xl border border-app-primary/20 rounded-3xl shadow-2xl shadow-app-primary/5 text-center relative overflow-hidden group hover:border-app-primary/40 transition-all duration-500"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-app-primary/10 blur-[100px] rounded-full pointer-events-none group-hover:bg-app-primary/20 transition-all duration-700" />
            <h3 className="text-2xl md:text-4xl font-bold text-app-text mb-6 relative z-10">
              Make your dream of coming to <span className="text-transparent bg-clip-text bg-gradient-to-r from-app-primary to-app-accent">Australia, UK</span>, and beyond true by nailing PTE.
            </h3>
            <p className="text-app-text-muted mb-8 relative z-10 max-w-2xl mx-auto leading-relaxed">
              The PTE Academic exam is widely accepted by universities, colleges, and governments around the world. Achieve your target score and unlock global opportunities.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 relative z-10">
              <div className="flex items-center gap-3 bg-app-surface/50 px-4 py-2 rounded-2xl border border-white/5 shadow-sm">
                <img src="https://flagcdn.com/au.svg" alt="Australia" className="w-8 drop-shadow-md rounded-sm" />
                <span className="font-bold text-app-text uppercase tracking-widest text-xs">Australia</span>
              </div>
              <div className="flex items-center gap-3 bg-app-surface/50 px-4 py-2 rounded-2xl border border-white/5 shadow-sm">
                <img src="https://flagcdn.com/gb.svg" alt="UK" className="w-8 drop-shadow-md rounded-sm" />
                <span className="font-bold text-app-text uppercase tracking-widest text-xs">UK</span>
              </div>
              <div className="flex items-center gap-3 bg-app-surface/50 px-4 py-2 rounded-2xl border border-white/5 shadow-sm">
                <img src="https://flagcdn.com/ca.svg" alt="Canada" className="w-8 drop-shadow-md rounded-sm" />
                <span className="font-bold text-app-text uppercase tracking-widest text-xs">Canada</span>
              </div>
              <div className="flex items-center gap-3 bg-app-surface/50 px-4 py-2 rounded-2xl border border-white/5 shadow-sm">
                <img src="https://flagcdn.com/nz.svg" alt="New Zealand" className="w-8 drop-shadow-md rounded-sm" />
                <span className="font-bold text-app-text uppercase tracking-widest text-xs">New Zealand</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Platform Preview Section */}
      <section className="relative z-10 py-24 px-6 bg-app-bg">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-14"
          >
            <p className="text-[10px] font-bold text-app-primary uppercase tracking-[0.3em] mb-3">Platform Preview</p>
            <h2 className="text-4xl md:text-5xl font-black text-app-text tracking-tight mb-4">
              Everything You Need to <span className="text-transparent bg-clip-text bg-gradient-to-r from-app-primary to-app-accent">Master PTE</span>
            </h2>
            <p className="text-base text-app-text-muted max-w-2xl mx-auto leading-relaxed">
              AI-powered practice tools, vocabulary mastery, full mock tests, and real-time support — all in one place.
            </p>
          </motion.div>

          {/* Bento grid collage */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5"
          >
            {/* Smart Dashboard — tall, spans 2 rows on md */}
            <div className="col-span-2 md:col-span-1 md:row-span-2 relative flex flex-col rounded-2xl overflow-hidden group border border-white/[0.07] hover:border-app-primary/40 transition-all duration-500 shadow-lg hover:shadow-xl hover:shadow-app-primary/10 min-h-[280px] md:min-h-[440px]">
              <div className="absolute inset-0 bg-gradient-to-br from-[#0d1f2d] via-[#0a2e2a] to-[#061a18]" />
              {/* Mock dashboard UI */}
              <div className="relative z-10 flex-1 p-5 flex flex-col gap-3 overflow-hidden pointer-events-none select-none">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-app-primary/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-app-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  </div>
                  <span className="text-white/70 text-xs font-semibold">My Progress</span>
                </div>
                {/* Progress bars */}
                <div className="space-y-2.5">
                  {[{ label: 'Speaking', w: '78%', color: 'bg-app-primary' }, { label: 'Writing', w: '65%', color: 'bg-teal-400' }, { label: 'Reading', w: '82%', color: 'bg-cyan-400' }, { label: 'Listening', w: '71%', color: 'bg-emerald-400' }].map(({ label, w, color }) => (
                    <div key={label}>
                      <div className="flex justify-between text-[10px] text-white/50 mb-1"><span>{label}</span><span>{w}</span></div>
                      <div className="h-1.5 bg-white/10 rounded-full"><div className={`h-full ${color} rounded-full`} style={{ width: w }} /></div>
                    </div>
                  ))}
                </div>
                {/* Streak card */}
                <div className="bg-white/5 rounded-xl p-3 border border-white/[0.07]">
                  <div className="text-[9px] text-white/40 uppercase tracking-widest mb-2">Study Streak</div>
                  <div className="flex items-end gap-1">
                    {[3,5,4,6,5,7,6].map((h, i) => (
                      <div key={i} className="flex-1 bg-app-primary/30 rounded-sm" style={{ height: `${h * 5}px` }} />
                    ))}
                  </div>
                </div>
                {/* Score badge */}
                <div className="bg-app-primary/10 border border-app-primary/20 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="text-[9px] text-app-primary/70 uppercase tracking-widest">Mock Score</div>
                    <div className="text-2xl font-black text-white">78 <span className="text-sm font-normal text-white/40">/ 90</span></div>
                  </div>
                  <svg className="w-8 h-8 text-app-primary/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
                </div>
              </div>
              <div className="relative z-10 px-5 py-4 border-t border-white/[0.07]">
                <p className="text-[10px] font-bold text-app-primary uppercase tracking-widest mb-0.5">Smart Dashboard</p>
                <p className="text-white font-bold text-sm leading-tight">Track your progress, study streak & plan</p>
              </div>
            </div>

            {/* Vocabulary Builder */}
            <div className="relative flex flex-col rounded-2xl overflow-hidden group border border-white/[0.07] hover:border-app-primary/40 transition-all duration-500 shadow-lg hover:shadow-xl hover:shadow-app-primary/10 min-h-[200px]">
              <div className="absolute inset-0 bg-gradient-to-br from-[#0d1a2d] via-[#0a2040] to-[#071830]" />
              {/* Mock vocab UI */}
              <div className="relative z-10 flex-1 p-4 flex flex-col gap-2.5 overflow-hidden pointer-events-none select-none">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                  </div>
                  <span className="text-white/70 text-[10px] font-semibold">Word of the Day</span>
                </div>
                <div className="bg-white/5 border border-white/[0.07] rounded-xl p-3">
                  <div className="text-teal-300 font-bold text-sm">ubiquitous</div>
                  <div className="text-white/40 text-[10px] mt-0.5">adj. present everywhere</div>
                  <div className="flex gap-1 mt-2">
                    <span className="bg-teal-500/20 text-teal-300 text-[9px] px-2 py-0.5 rounded-full">Academic</span>
                    <span className="bg-white/10 text-white/40 text-[9px] px-2 py-0.5 rounded-full">🔊 Audio</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  {['prevalent', 'pervasive', 'omnipresent'].map(w => (
                    <div key={w} className="flex-1 bg-white/5 border border-white/[0.07] rounded-lg p-1.5 text-center text-[9px] text-white/40">{w}</div>
                  ))}
                </div>
              </div>
              <div className="relative z-10 px-4 py-3 border-t border-white/[0.07]">
                <p className="text-[10px] font-bold text-app-primary uppercase tracking-widest mb-0.5">Vocabulary Builder</p>
                <p className="text-white font-bold text-sm leading-tight">2000+ academic words with audio</p>
              </div>
            </div>

            {/* Premium Plans */}
            <div className="relative flex flex-col rounded-2xl overflow-hidden group border border-white/[0.07] hover:border-app-primary/40 transition-all duration-500 shadow-lg hover:shadow-xl hover:shadow-app-primary/10 min-h-[200px]">
              <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a0d] via-[#1a2a10] to-[#0a1a10]" />
              {/* Mock pricing UI */}
              <div className="relative z-10 flex-1 p-4 flex flex-col gap-2.5 overflow-hidden pointer-events-none select-none">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  </div>
                  <span className="text-white/70 text-[10px] font-semibold">Choose Your Plan</span>
                </div>
                <div className="bg-app-primary/10 border border-app-primary/30 rounded-xl p-3 relative mt-1">
                  <span className="absolute -top-2.5 right-3 bg-app-primary text-black text-[8px] font-bold px-2 py-0.5 rounded-full">POPULAR</span>
                  <div className="text-white font-bold text-xs">Pro Plan</div>
                  <div className="text-app-primary font-black text-lg mt-0.5">$19<span className="text-xs font-normal text-white/40">/mo</span></div>
                  <div className="flex flex-col gap-1 mt-2">
                    {['Full mock tests', 'AI feedback', 'All practice tools'].map(f => (
                      <div key={f} className="flex items-center gap-1.5"><span className="text-app-primary text-[10px]">✓</span><span className="text-white/50 text-[9px]">{f}</span></div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="relative z-10 px-4 py-3 border-t border-white/[0.07]">
                <p className="text-[10px] font-bold text-app-primary uppercase tracking-widest mb-0.5">Premium Plans</p>
                <p className="text-white font-bold text-sm leading-tight">Affordable pricing, exceptional results</p>
              </div>
            </div>

            {/* Help & Support — spans full width on mobile, 2 cols on md */}
            <div className="col-span-2 md:col-span-2 relative flex flex-col rounded-2xl overflow-hidden group border border-white/[0.07] hover:border-app-primary/40 transition-all duration-500 shadow-lg hover:shadow-xl hover:shadow-app-primary/10 min-h-[200px]">
              <div className="absolute inset-0 bg-gradient-to-br from-[#071a20] via-[#0a1f2a] to-[#061520]" />
              {/* Mock chat UI */}
              <div className="relative z-10 flex-1 p-5 flex flex-col gap-2.5 overflow-hidden pointer-events-none select-none">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                  </div>
                  <span className="text-white/70 text-[10px] font-semibold">PTE AI Assistant</span>
                  <span className="ml-auto flex items-center gap-1.5 text-[9px] text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />Online
                  </span>
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:gap-4">
                  <div className="bg-white/10 border border-white/[0.07] rounded-xl rounded-tl-sm p-3 max-w-[70%]">
                    <p className="text-white/70 text-[10px] leading-relaxed">Hi! I'm your PTE study assistant. How can I help you today? 👋</p>
                  </div>
                  <div className="bg-app-primary/15 border border-app-primary/20 rounded-xl rounded-tr-sm p-3 max-w-[70%] self-end ml-auto">
                    <p className="text-white/70 text-[10px] leading-relaxed">Can you help me improve my speaking score?</p>
                  </div>
                </div>
                <div className="bg-white/10 border border-white/[0.07] rounded-xl rounded-tl-sm p-3 max-w-[75%]">
                  <p className="text-white/70 text-[10px] leading-relaxed">Absolutely! I'll analyze your responses and give personalized tips. ✨</p>
                </div>
              </div>
              <div className="relative z-10 px-5 py-4 border-t border-white/[0.07]">
                <p className="text-[10px] font-bold text-app-primary uppercase tracking-widest mb-0.5">Help & Support</p>
                <p className="text-white font-bold text-base leading-tight">AI-powered support bot, always ready to help</p>
              </div>
            </div>
          </motion.div>
          
          <div className="mt-12 text-center">
            <button 
              onClick={() => onLogin()}
              className="inline-flex items-center gap-3 px-8 py-4 bg-app-surface/50 border border-app-primary/20 text-app-primary font-bold text-sm rounded-xl hover:bg-app-primary/10 transition-all"
            >
              Explore All Features
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative z-10 py-32 px-6 bg-app-surface/20 border-t border-white/[0.03]">
        <div className="max-w-4xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <p className="text-[10px] font-bold text-app-primary uppercase tracking-[0.3em] mb-3">Your Journey</p>
            <h2 className="text-4xl md:text-5xl font-black text-app-text tracking-tight mb-4">
              How <span className="text-transparent bg-clip-text bg-gradient-to-r from-app-primary to-app-accent">It Works</span>
            </h2>
          </motion.div>

          <div className="relative">
            {/* Connecting Line */}
            <div className="absolute left-[27px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-app-primary/50 via-app-accent/50 to-transparent md:left-1/2 md:-ml-[1px]" />
            
            {/* Step 1 */}
            <motion.div 
              initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
              className="relative flex items-start gap-8 mb-16 md:justify-between md:items-center"
            >
              <div className="md:w-5/12 md:text-right order-2 md:order-1 ml-16 md:ml-0">
                <h3 className="text-2xl font-bold text-app-text mb-2">1. Take a Mock Test</h3>
                <p className="text-app-text-muted leading-relaxed">Experience the real PTE exam interface under timed conditions to get an accurate baseline score.</p>
              </div>
              <div className="absolute left-0 md:left-1/2 md:-translate-x-1/2 w-14 h-14 bg-app-bg border border-app-primary rounded-full flex items-center justify-center z-10 shadow-[0_0_15px_rgba(var(--app-primary-rgb),0.3)] order-1 md:order-2">
                <Clock className="text-app-primary" size={24} />
              </div>
              <div className="hidden md:block md:w-5/12 order-3" />
            </motion.div>

            {/* Step 2 */}
            <motion.div 
              initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
              className="relative flex items-start gap-8 mb-16 md:justify-between md:items-center"
            >
              <div className="hidden md:block md:w-5/12 order-1" />
              <div className="absolute left-0 md:left-1/2 md:-translate-x-1/2 w-14 h-14 bg-app-bg border border-app-primary rounded-full flex items-center justify-center z-10 shadow-[0_0_15px_rgba(var(--app-primary-rgb),0.3)] order-1 md:order-2">
                <Zap className="text-app-primary" size={24} />
              </div>
              <div className="md:w-5/12 md:text-left order-2 md:order-3 ml-16 md:ml-0">
                <h3 className="text-2xl font-bold text-app-text mb-2">2. Instant AI Analysis</h3>
                <p className="text-app-text-muted leading-relaxed">Our advanced AI breaks down your speaking and writing word by word, highlighting exact areas to improve.</p>
              </div>
            </motion.div>

            {/* Step 3 */}
            <motion.div 
              initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }}
              className="relative flex items-start gap-8 md:justify-between md:items-center"
            >
              <div className="md:w-5/12 md:text-right order-2 md:order-1 ml-16 md:ml-0">
                <h3 className="text-2xl font-bold text-app-text mb-2">3. Achieve Your Target</h3>
                <p className="text-app-text-muted leading-relaxed">Focus on your weak points with our targeted practice exercises and crush the real exam.</p>
              </div>
              <div className="absolute left-0 md:left-1/2 md:-translate-x-1/2 w-14 h-14 bg-app-bg border border-app-primary rounded-full flex items-center justify-center z-10 shadow-[0_0_15px_rgba(var(--app-primary-rgb),0.3)] order-1 md:order-2">
                <Target className="text-app-primary" size={24} />
              </div>
              <div className="hidden md:block md:w-5/12 order-3" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 py-32 px-6 bg-app-bg">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h3 className="text-3xl md:text-5xl font-black text-app-text tracking-tight mb-4">Master Every Section</h3>
            <p className="text-app-text-muted text-lg max-w-2xl mx-auto">Our specialized AI modules are designed to analyze your performance and guide you towards perfection.</p>
          </motion.div>
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
      <section className="relative z-10 py-32 px-6 bg-app-surface/30 backdrop-blur-md border-y border-app-border">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
          <StatItem value="98%" label="Accuracy Rate" />
          <StatItem value="22k+" label="Practice Tasks" />
          <StatItem value="15k+" label="Active Ninjas" />
          <StatItem value="24/7" label="AI Support" />
        </div>
      </section>

      {/* PTE Academic Task Breakdown Section */}
      <section className="relative z-10 py-24 px-6 bg-app-surface/10 border-t border-app-border">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-[10px] font-bold text-app-primary uppercase tracking-[0.3em] mb-3">Complete Overview</p>
            <h2 className="text-3xl md:text-5xl font-black text-app-text tracking-tight mb-4">PTE Academic Test Structure</h2>
            <p className="text-app-text-muted text-base max-w-2xl mx-auto">
              Understand the 3 official test sections evaluated in the Pearson Test of English Academic.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 bg-app-surface/40 border border-app-border rounded-3xl space-y-4">
              <div className="flex items-center gap-3 text-app-primary font-bold text-xl">
                <Mic size={24} />
                <span>1. Speaking & Writing (54–67 Mins)</span>
              </div>
              <p className="text-sm text-app-text-muted leading-relaxed">
                Tested together in a single section. Evaluates oral fluency, pronunciation, written discourse, and vocabulary across Read Aloud, Repeat Sentence, Describe Image, Re-tell Lecture, Summarize Written Text, and Write Essay.
              </p>
            </div>

            <div className="p-8 bg-app-surface/40 border border-app-border rounded-3xl space-y-4">
              <div className="flex items-center gap-3 text-app-primary font-bold text-xl">
                <CheckCircle size={24} />
                <span>2. Reading (29–30 Mins)</span>
              </div>
              <p className="text-sm text-app-text-muted leading-relaxed">
                Tests passage comprehension, collocations, and structural reasoning with Reading Fill in the Blanks, Reading & Writing Fill in the Blanks, Multiple Choice, and Re-order Paragraphs.
              </p>
            </div>

            <div className="p-8 bg-app-surface/40 border border-app-border rounded-3xl space-y-4">
              <div className="flex items-center gap-3 text-app-primary font-bold text-xl">
                <Clock size={24} />
                <span>3. Listening (30–43 Mins)</span>
              </div>
              <p className="text-sm text-app-text-muted leading-relaxed">
                Assesses auditory processing through Summarize Spoken Text, Multiple Choice, Fill in the Blanks, Highlight Correct Summary, Select Missing Word, Highlight Incorrect Words, and Write from Dictation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comprehensive FAQ Section */}
      <section className="relative z-10 py-24 px-6 bg-app-bg border-t border-app-border">
        <div className="max-w-4xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-[10px] font-bold text-app-primary uppercase tracking-[0.3em] mb-3">Frequently Asked Questions</p>
            <h2 className="text-3xl md:text-5xl font-black text-app-text tracking-tight mb-4">Everything You Need to Know</h2>
          </motion.div>

          <div className="space-y-6">
            {[
              {
                q: "What is PTE Academic and who accepts it?",
                a: "PTE Academic (Pearson Test of English) is a computer-based English language proficiency exam accepted by thousands of universities, colleges, and government agencies worldwide for study, work, and visa applications (including Australia, UK, Canada, and New Zealand)."
              },
              {
                q: "How does PTE Ninja's AI scoring engine work?",
                a: "PTE Ninja uses advanced speech recognition and natural language processing models calibrated to the PTE Academic scoring rubric. It provides real-time scoring on Oral Fluency, Pronunciation, Grammar, Content, and Vocabulary."
              },
              {
                q: "How are the mock tests structured?",
                a: "Our full scored mock tests follow the exact timing, question sequencing, and scoring rubrics of the actual PTE Academic exam to give you an accurate baseline score before test day."
              },
              {
                q: "What target scores can I prepare for?",
                a: "Whether your target is 65+ (Competent English for visa points), 79+ (Proficient English), or 90 (Superior English), PTE Ninja offers tailored practice modules and weak-area diagnostics."
              },
              {
                q: "Can I practice for free?",
                a: "Yes! PTE Ninja offers free access to practice tasks, vocabulary builders, and AI evaluations so you can test the platform before upgrading."
              }
            ].map((faq, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="p-6 bg-app-surface/40 border border-app-border rounded-2xl space-y-2"
              >
                <h3 className="text-lg font-bold text-app-text">{faq.q}</h3>
                <p className="text-sm text-app-text-muted leading-relaxed">{faq.a}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>


      {/* Footer CTA */}
      <section className="relative z-10 py-24 px-6 max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="bg-app-surface/40 backdrop-blur-xl border border-app-primary/20 rounded-3xl p-12 md:p-16 relative overflow-hidden shadow-2xl"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-app-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-app-accent/10 rounded-full blur-3xl pointer-events-none" />
          
          <h2 className="text-4xl md:text-6xl font-black text-app-text tracking-tighter mb-6 relative z-10">
            Ready to crush the PTE?
          </h2>
          <p className="text-xl text-app-text-muted mb-10 max-w-2xl mx-auto relative z-10">
            Join thousands of students who achieved their target scores with our AI-powered platform.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 relative z-10">
            <button 
              onClick={() => onLogin('register')}
              className="group flex items-center justify-center gap-3 w-full sm:w-auto px-12 py-5 bg-app-primary text-app-bg font-bold text-xl rounded-2xl hover:scale-105 transition-all shadow-[0_0_30px_rgba(var(--app-primary-rgb),0.4)]"
            >
              Get Started Now
              <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-20 px-6 bg-app-bg border-t border-app-border">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 text-left">
            <div className="space-y-6">
              <Logo showText={true} size={32} />
              <p className="text-sm text-app-text-muted/60 leading-relaxed">
                The ultimate AI-powered PTE training platform. Master your future with precision scoring and real-time feedback.
              </p>
            </div>
            
            <div className="space-y-6">
              <h4 className="text-sm font-bold text-app-text uppercase tracking-widest">Training</h4>
              <ul className="space-y-4 text-sm text-app-text-muted/60">
                <li><button className="hover:text-app-primary transition-colors">Speaking Dojo</button></li>
                <li><button className="hover:text-app-primary transition-colors">Writing Dojo</button></li>
                <li><button className="hover:text-app-primary transition-colors">Reading Dojo</button></li>
                <li><button className="hover:text-app-primary transition-colors">Listening Dojo</button></li>
              </ul>
            </div>

            <div className="space-y-6">
              <h4 className="text-sm font-bold text-app-text uppercase tracking-widest">Resources</h4>
              <ul className="space-y-4 text-sm text-app-text-muted/60">
                <li><button className="hover:text-app-primary transition-colors">Vocabulary Bank</button></li>
                <li><button className="hover:text-app-primary transition-colors">Exam Patterns</button></li>
                <li><button className="hover:text-app-primary transition-colors">Study Roadmap</button></li>
                <li><button className="hover:text-app-primary transition-colors">AI Scoring Guide</button></li>
              </ul>
            </div>

            <div className="space-y-6">
              <h4 className="text-sm font-bold text-app-text uppercase tracking-widest">Legal</h4>
              <ul className="space-y-4 text-sm text-app-text-muted/60">
                <li><a href="/?policy=disclaimer" onClick={(e) => { e.preventDefault(); setActivePolicy('disclaimer'); }} className="hover:text-app-primary transition-colors cursor-pointer">Disclaimer</a></li>
                <li><a href="/?policy=terms" onClick={(e) => { e.preventDefault(); setActivePolicy('terms'); }} className="hover:text-app-primary transition-colors cursor-pointer">Terms & Conditions</a></li>
                <li><a href="/?policy=privacy" onClick={(e) => { e.preventDefault(); setActivePolicy('privacy'); }} className="hover:text-app-primary transition-colors cursor-pointer">Privacy Policy</a></li>
                <li><a href="/?policy=refund" onClick={(e) => { e.preventDefault(); setActivePolicy('refund'); }} className="hover:text-app-primary transition-colors cursor-pointer">Refund / Cancellation Policy</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-12 border-t border-app-border flex flex-col md:flex-row items-center justify-between gap-6">
            <p className="text-xs text-app-text-muted/30">All rights reserved © AI Geek Advisor Pvt. Ltd., 2026</p>
            
            <a 
              href="https://www.aigeekadvisor.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <span className="text-sm text-app-text-muted font-medium">Developed by</span>
              <img src="/ai-geek-logo.png" alt="AI Geek Advisor" className="h-8 rounded-[4px] shadow-sm" />
              <span className="text-lg font-bold text-[#004e82]">AI Geek Advisor</span>
            </a>

            <div className="flex items-center gap-6">
              <span className="text-[10px] font-bold text-app-primary uppercase tracking-widest flex items-center gap-2">
                <Shield size={12} /> {isNativeMobile() ? (isIOS() ? 'Secure In-App Purchases via App Store' : 'Secure In-App Purchases via Google Play') : 'Secure Payments with Razorpay'}
              </span>
            </div>
          </div>
          
          <p className="text-[10px] text-app-text-muted/20 text-center mt-8 max-w-2xl mx-auto leading-relaxed italic">
            PTE Ninja is an independent preparation platform. We are NOT affiliated with, approved by, or endorsed by Pearson PLC or Pearson Education, Inc. "PTE Academic" is a registered trademark of Pearson PLC.
          </p>
        </div>
      </footer>
    </div>
  );
}
