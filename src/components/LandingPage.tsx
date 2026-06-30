import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, X, Sun, Moon, Star, ArrowRight, Mic, PenTool, Target, ShieldCheck } from 'lucide-react';
import { Logo } from './Logo';
import { PrivacyPolicy } from './PrivacyPolicy';
import { TermsOfService } from './TermsOfService';
import { POLICIES } from '../data/policies';
import { ScrollNinja } from './ScrollNinja';

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

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="p-10 bg-app-surface/50 backdrop-blur-md border border-app-primary/10 rounded-3xl hover:border-app-primary/40 hover:bg-app-surface transition-all group">
      <div className="w-14 h-14 bg-app-primary/10 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-app-primary transition-colors">
        <Icon className="text-app-primary group-hover:text-app-bg" size={28} />
      </div>
      <h3 className="text-2xl font-bold text-app-text mb-4">{title}</h3>
      <p className="text-app-text-muted leading-relaxed">{description}</p>
    </div>
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
  onLogin: () => void, 
  onGuest: () => void, 
  authError: string | null, 
  onClearError: () => void,
  isDarkMode: boolean,
  setIsDarkMode: (val: boolean) => void
}) {
  const [activePolicy, setActivePolicy] = useState<keyof typeof POLICIES | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const policy = params.get('policy');
    if (policy === 'privacy' || policy === 'terms' || policy === 'disclaimer' || policy === 'refund') {
      setActivePolicy(policy as keyof typeof POLICIES);
    }
  }, []);

  return (
    <div className="min-h-screen bg-app-bg text-app-text-muted font-sans selection:bg-app-primary/30 overflow-x-hidden transition-colors duration-300">
      <ScrollNinja />
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
            <div className="bg-red-500/10 border border-red-500/20 backdrop-blur-xl p-4 rounded-2xl flex items-start gap-4 shadow-2xl shadow-red-500/10">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center shrink-0">
                <Shield size={20} className="text-red-500" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="text-sm font-bold text-white">Access Error</h4>
                <p className="text-xs text-red-200/70 leading-relaxed whitespace-pre-wrap">
                  {authError.split(/(https?:\/\/[^\s]+)/g).map((part, i) => 
                    part.match(/^https?:\/\//) ? (
                      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-white underline hover:text-app-primary transition-colors">
                        {part}
                      </a>
                    ) : part
                  )}
                </p>
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
      
      {/* Background Glows and Abstract Shapes */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-app-primary/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-app-accent/10 blur-[150px] rounded-full" />
      </div>

      {/* Navbar */}
      <nav className="relative z-20 flex items-center justify-between px-4 sm:px-8 py-6 max-w-7xl mx-auto">
        <Logo showText={true} size={40} className="shadow-[0_0_20px_rgba(var(--app-primary-rgb),0.3)]" />
        <div className="flex items-center gap-2 sm:gap-6 bg-app-surface/50 backdrop-blur-md px-4 py-2 rounded-full border border-app-border">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 hover:bg-app-surface rounded-full transition-colors text-app-text-muted hover:text-app-primary"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button onClick={onLogin} className="hidden sm:block text-sm font-bold text-app-text hover:text-app-primary transition-colors">Sign In</button>
          <button 
            onClick={onLogin}
            className="px-4 sm:px-6 py-2 sm:py-2 bg-app-primary text-app-bg font-bold text-sm sm:text-base rounded-full hover:bg-app-accent transition-all shadow-[0_0_20px_rgba(var(--app-primary-rgb),0.2)]"
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
          <motion.div 
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-app-surface/80 backdrop-blur-md rounded-full border border-app-primary/20 text-xs font-bold tracking-widest text-app-primary uppercase shadow-lg shadow-app-primary/10"
          >
            <Star size={14} className="fill-current" />
            Turn Your Dreams Into Reality
          </motion.div>
          <h2 className="text-5xl md:text-8xl font-black text-app-text tracking-tighter leading-[1.1]">
            MAKE YOUR DREAM OF COMING TO AUSTRALIA OR UK TRUE BY <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-app-primary to-app-accent">NAILING PTE</span>
          </h2>
          <p className="text-xl text-app-text-muted max-w-3xl mx-auto leading-relaxed">
            Unleash your true potential with the ultimate AI PTE trainer. Get real-time feedback, realistic mock tests, and actionable insights to achieve your target score.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
            <button 
              onClick={onLogin}
              className="group flex items-center justify-center gap-3 w-full sm:w-auto px-10 py-5 bg-gradient-to-r from-app-primary to-app-accent text-app-bg font-bold text-lg rounded-2xl hover:scale-105 transition-all shadow-[0_0_30px_rgba(var(--app-primary-rgb),0.5)]"
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
          </div>
        </motion.div>
      </header>

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
            <p className="text-xs text-app-text-muted/30">All rights reserved © PTE Ninja, 2026</p>
            <div className="flex items-center gap-6">
              <span className="text-[10px] font-bold text-app-primary uppercase tracking-widest flex items-center gap-2">
                <Shield size={12} /> Secure Payments with Stripe
              </span>
            </div>
          </div>
          
          <p className="text-[10px] text-app-text-muted/20 text-center mt-8 max-w-2xl mx-auto leading-relaxed italic">
            Ninja PTE Prep is an independent preparation platform. We are NOT affiliated with, approved by, or endorsed by Pearson PLC or Pearson Education, Inc. "PTE Academic" is a registered trademark of Pearson PLC.
          </p>
        </div>
      </footer>
    </div>
  );
}
