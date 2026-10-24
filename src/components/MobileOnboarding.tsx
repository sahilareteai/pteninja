import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  ArrowRight, 
  Mic, 
  Award, 
  Target, 
  Flame, 
  Volume2, 
  CheckCircle2, 
  ShieldCheck, 
  Zap, 
  Mail, 
  Globe2,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import { Logo } from './Logo';

interface MobileOnboardingProps {
  onGoogleLogin: () => void;
  onEmailLogin: (mode?: 'signin' | 'register') => void;
  onGuestAccess: () => void;
  authError?: string | null;
  onClearError?: () => void;
}

export const MobileOnboarding: React.FC<MobileOnboardingProps> = ({
  onGoogleLogin,
  onEmailLogin,
  onGuestAccess,
  authError,
  onClearError
}) => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const SLIDES_COUNT = 4;
  const SLIDE_DURATION = 5000; // 5 seconds per slide

  // Auto-advance slides like Instagram / Duolingo stories
  useEffect(() => {
    if (isPaused) return;

    timerRef.current = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SLIDES_COUNT);
    }, SLIDE_DURATION);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, activeSlide]);

  const handleNextSlide = () => {
    setActiveSlide((prev) => (prev + 1) % SLIDES_COUNT);
  };

  const handlePrevSlide = () => {
    setActiveSlide((prev) => (prev - 1 + SLIDES_COUNT) % SLIDES_COUNT);
  };

  const handleGoogleClick = async () => {
    try {
      setIsSigningIn(true);
      await onGoogleLogin();
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0C10] text-[#C5C6C7] flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Dynamic Ambient Background Glows */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#45A29E]/20 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-[#66FCF1]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[130px] pointer-events-none" />

      {/* Cyber Grid Texture Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(#66FCF1 1px, transparent 1px), linear-gradient(90deg, #66FCF1 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }}
      />

      {/* Top Header & Story Progress Bars */}
      <div className="relative z-20 pt-4 px-5">
        {/* Story Progress Indicators */}
        <div className="flex gap-1.5 mb-3">
          {Array.from({ length: SLIDES_COUNT }).map((_, idx) => (
            <div 
              key={idx}
              onClick={() => setActiveSlide(idx)}
              className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden cursor-pointer relative"
            >
              <motion.div 
                className="h-full bg-gradient-to-r from-[#45A29E] to-[#66FCF1] rounded-full"
                initial={{ width: idx < activeSlide ? '100%' : '0%' }}
                animate={{ 
                  width: idx === activeSlide ? '100%' : idx < activeSlide ? '100%' : '0%' 
                }}
                transition={{ 
                  duration: idx === activeSlide && !isPaused ? SLIDE_DURATION / 1000 : 0, 
                  ease: 'linear' 
                }}
              />
            </div>
          ))}
        </div>

        {/* Top Navigation Row */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2.5">
            <Logo size={36} showText={false} />
            <div className="flex flex-col leading-none">
              <span className="text-sm font-black tracking-wider text-white uppercase">PTE NINJA</span>
              <span className="text-[10px] font-bold text-[#66FCF1] tracking-wider uppercase">AI-Powered Exam Prep</span>
            </div>
          </div>

          <button
            onClick={onGuestAccess}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/90 backdrop-blur-md transition-all active:scale-95"
          >
            <span>Explore App</span>
            <ChevronRight size={14} className="text-[#66FCF1]" />
          </button>
        </div>
      </div>

      {/* Main Interactive Animated Stage (Tap left/right to navigate, hold to pause) */}
      <div 
        className="relative z-10 flex-1 flex flex-col justify-center px-6 py-2 touch-pan-y"
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
      >
        {/* Invisible tap areas for quick story skip */}
        <div 
          onClick={handlePrevSlide} 
          className="absolute left-0 top-0 bottom-0 w-1/4 z-30 opacity-0 cursor-pointer" 
          aria-label="Previous slide"
        />
        <div 
          onClick={handleNextSlide} 
          className="absolute right-0 top-0 bottom-0 w-1/4 z-30 opacity-0 cursor-pointer" 
          aria-label="Next slide"
        />

        <AnimatePresence mode="wait">
          {/* SLIDE 0: Dream to Australia, UK & Canada */}
          {activeSlide === 0 && (
            <motion.div
              key="slide-0"
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.98 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex flex-col items-center text-center space-y-4 max-w-sm mx-auto w-full"
            >
              {/* Dream Destination Badge Cards */}
              <div className="grid grid-cols-2 gap-2.5 w-full">
                <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-[#45A29E]/30 backdrop-blur-md shadow-lg shadow-black/40">
                  <img src="https://flagcdn.com/au.svg" alt="Australia" className="w-7 h-5 object-cover rounded shadow" />
                  <div className="text-left leading-tight">
                    <p className="text-xs font-black text-white">Australia</p>
                    <p className="text-[10px] text-[#66FCF1] font-medium">PR & Work Visa</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 backdrop-blur-md shadow-lg shadow-black/40">
                  <img src="https://flagcdn.com/gb.svg" alt="UK" className="w-7 h-5 object-cover rounded shadow" />
                  <div className="text-left leading-tight">
                    <p className="text-xs font-black text-white">UK</p>
                    <p className="text-[10px] text-white/60 font-medium">Work & Masters</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 backdrop-blur-md shadow-lg shadow-black/40">
                  <img src="https://flagcdn.com/ca.svg" alt="Canada" className="w-7 h-5 object-cover rounded shadow" />
                  <div className="text-left leading-tight">
                    <p className="text-xs font-black text-white">Canada</p>
                    <p className="text-[10px] text-white/60 font-medium">Express Entry</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 backdrop-blur-md shadow-lg shadow-black/40">
                  <img src="https://flagcdn.com/nz.svg" alt="New Zealand" className="w-7 h-5 object-cover rounded shadow" />
                  <div className="text-left leading-tight">
                    <p className="text-xs font-black text-white">New Zealand</p>
                    <p className="text-[10px] text-white/60 font-medium">Skilled Migrant</p>
                  </div>
                </div>
              </div>

              {/* Target Score Callout Hero Pill */}
              <div className="relative py-2.5 px-5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-emerald-500/15 to-[#45A29E]/15 border border-amber-500/30 flex items-center gap-3 shadow-xl">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-[#0B0C10] font-black text-lg shadow-md shadow-amber-500/30">
                  79+
                </div>
                <div className="text-left leading-tight">
                  <span className="text-xs font-extrabold text-white flex items-center gap-1">
                    Superior English Score <Sparkles size={12} className="text-yellow-400" />
                  </span>
                  <span className="text-[11px] text-amber-300/90 font-semibold">+20 Permanent Residency Points</span>
                </div>
              </div>

              {/* Typography */}
              <div className="space-y-1.5 pt-1">
                <h1 className="text-2xl font-black text-white tracking-tight leading-tight">
                  Make Your Dream of <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#66FCF1] via-[#45A29E] to-emerald-400">
                    Australia & Beyond
                  </span> True
                </h1>
                <p className="text-xs text-white/70 leading-relaxed max-w-xs mx-auto">
                  Master PTE Academic & Core with Australia&apos;s premier AI-powered scoring platform.
                </p>
              </div>
            </motion.div>
          )}

          {/* SLIDE 1: Real-Time AI Speech Scoring */}
          {activeSlide === 1 && (
            <motion.div
              key="slide-1"
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.98 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex flex-col items-center text-center space-y-4 max-w-sm mx-auto w-full"
            >
              {/* Simulated Live Speech AI Waveform Card */}
              <div className="w-full p-4 rounded-3xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-[#66FCF1]/30 backdrop-blur-xl shadow-2xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-[11px] font-bold text-white uppercase tracking-wider">AI Speech Engine</span>
                  </div>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#45A29E]/20 text-[#66FCF1] border border-[#66FCF1]/30">
                    Pearson 1:1 Calibrated
                  </span>
                </div>

                {/* Animated Audio Soundwave */}
                <div className="h-14 flex items-center justify-center gap-1.5 py-2 px-4 bg-black/40 rounded-2xl border border-white/5 mb-3">
                  {[24, 48, 36, 56, 28, 44, 52, 38, 60, 42, 30, 50, 32].map((height, i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 rounded-full bg-gradient-to-t from-[#45A29E] to-[#66FCF1]"
                      animate={{ height: [height * 0.3, height, height * 0.4] }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.8,
                        delay: i * 0.06,
                        ease: 'easeInOut'
                      }}
                    />
                  ))}
                </div>

                {/* Score Breakdown Progress Bars */}
                <div className="space-y-2 text-left">
                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-white mb-0.5">
                      <span>Oral Fluency</span>
                      <span className="text-emerald-400 font-black">90 / 90</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 w-full rounded-full" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-white mb-0.5">
                      <span>Pronunciation</span>
                      <span className="text-[#66FCF1] font-black">88 / 90</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#45A29E] to-[#66FCF1] w-[97%] rounded-full" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-white mb-0.5">
                      <span>Content Clarity</span>
                      <span className="text-yellow-400 font-black">90 / 90</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 w-full rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Title & Desc */}
              <div className="space-y-1.5 pt-1">
                <h2 className="text-2xl font-black text-white tracking-tight leading-tight">
                  Instant AI Speech Scoring <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#66FCF1] to-emerald-400">
                    With Zero Delay
                  </span>
                </h2>
                <p className="text-xs text-white/70 leading-relaxed max-w-xs mx-auto">
                  Practice Read Aloud, Repeat Sentence, and Describe Image with official Pearson phoneme evaluation.
                </p>
              </div>
            </motion.div>
          )}

          {/* SLIDE 2: Full Scored Mock Tests */}
          {activeSlide === 2 && (
            <motion.div
              key="slide-2"
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.98 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex flex-col items-center text-center space-y-4 max-w-sm mx-auto w-full"
            >
              {/* Mock Test Scorecard Card */}
              <div className="w-full p-4 rounded-3xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-amber-500/30 backdrop-blur-xl shadow-2xl relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Award size={16} className="text-amber-400" />
                    <span className="text-[11px] font-bold text-white uppercase tracking-wider">Official Mock Exam</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Passed (79+)
                  </span>
                </div>

                {/* Score Grid */}
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  <div className="p-2 rounded-xl bg-black/40 border border-white/5 text-center">
                    <p className="text-[10px] text-white/60 font-semibold">Speaking</p>
                    <p className="text-sm font-black text-[#66FCF1]">88</p>
                  </div>
                  <div className="p-2 rounded-xl bg-black/40 border border-white/5 text-center">
                    <p className="text-[10px] text-white/60 font-semibold">Writing</p>
                    <p className="text-sm font-black text-amber-300">84</p>
                  </div>
                  <div className="p-2 rounded-xl bg-black/40 border border-white/5 text-center">
                    <p className="text-[10px] text-white/60 font-semibold">Reading</p>
                    <p className="text-sm font-black text-emerald-400">82</p>
                  </div>
                  <div className="p-2 rounded-xl bg-black/40 border border-white/5 text-center">
                    <p className="text-[10px] text-white/60 font-semibold">Listening</p>
                    <p className="text-sm font-black text-[#66FCF1]">86</p>
                  </div>
                </div>

                <div className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-[#45A29E]/10 border border-emerald-500/20 flex items-center justify-between">
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-white/60 uppercase">Overall PTE Score</p>
                    <p className="text-xs font-extrabold text-white">Band 8+ Equivalent</p>
                  </div>
                  <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-emerald-400">
                    85 / 90
                  </div>
                </div>
              </div>

              {/* Title & Desc */}
              <div className="space-y-1.5 pt-1">
                <h2 className="text-2xl font-black text-white tracking-tight leading-tight">
                  Full Pearson Exam Simulator <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-[#66FCF1]">
                    Real Test Conditions
                  </span>
                </h2>
                <p className="text-xs text-white/70 leading-relaxed max-w-xs mx-auto">
                  Experience the exact interface, official timing algorithms, and instant diagnostic score reports.
                </p>
              </div>
            </motion.div>
          )}

          {/* SLIDE 3: Shuriken Speed Practice & Daily Streak */}
          {activeSlide === 3 && (
            <motion.div
              key="slide-3"
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.98 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex flex-col items-center text-center space-y-4 max-w-sm mx-auto w-full"
            >
              {/* Gamification Dojo Card */}
              <div className="w-full p-4 rounded-3xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-[#66FCF1]/30 backdrop-blur-xl shadow-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="text-orange-400 fill-orange-400 animate-bounce" size={20} />
                    <div className="text-left">
                      <p className="text-xs font-black text-white">7-Day Study Streak</p>
                      <p className="text-[10px] text-orange-300/80 font-semibold">15 Mins Practice Today</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
                    +150 XP
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-left">
                  <div className="p-2.5 rounded-2xl bg-black/40 border border-white/5 flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-[#45A29E]/20 text-[#66FCF1] flex items-center justify-center font-bold text-xs">
                      20
                    </div>
                    <div className="leading-tight">
                      <p className="text-[11px] font-bold text-white">Question Types</p>
                      <p className="text-[9px] text-white/50">Full Coverage</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-black/40 border border-white/5 flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold text-xs">
                      ⚡
                    </div>
                    <div className="leading-tight">
                      <p className="text-[11px] font-bold text-white">Shuriken Drills</p>
                      <p className="text-[9px] text-white/50">Rapid Fire</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Title & Desc */}
              <div className="space-y-1.5 pt-1">
                <h2 className="text-2xl font-black text-white tracking-tight leading-tight">
                  Master PTE In <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-300 to-[#66FCF1]">
                    15 Minutes a Day
                  </span>
                </h2>
                <p className="text-xs text-white/70 leading-relaxed max-w-xs mx-auto">
                  Turn commute and coffee breaks into high-impact practice drills engineered for mobile.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dot Indicators */}
        <div className="flex justify-center items-center gap-1.5 pt-3">
          {Array.from({ length: SLIDES_COUNT }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveSlide(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                activeSlide === idx 
                  ? 'w-6 bg-[#66FCF1]' 
                  : 'w-1.5 bg-white/20 hover:bg-white/40'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Bottom Action Area (World-Class Mobile Conversion Sheet) */}
      <div className="relative z-20 px-6 pb-6 pt-3 bg-gradient-to-t from-[#0B0C10] via-[#0B0C10]/95 to-transparent backdrop-blur-md">
        {/* Error notice if sign-in fails */}
        {authError && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center justify-between"
          >
            <span className="line-clamp-2">{authError}</span>
            {onClearError && (
              <button onClick={onClearError} className="p-1 hover:text-white font-bold shrink-0 ml-2">
                ✕
              </button>
            )}
          </motion.div>
        )}

        <div className="space-y-2.5 max-w-sm mx-auto">
          {/* Primary Action: Continue with Google (World-Class Clean Look) */}
          <button
            onClick={handleGoogleClick}
            disabled={isSigningIn}
            className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-gray-100 text-gray-900 font-extrabold text-sm flex items-center justify-center gap-3 shadow-xl shadow-white/10 active:scale-[0.98] transition-all disabled:opacity-70 cursor-pointer"
          >
            {isSigningIn ? (
              <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>{isSigningIn ? 'Connecting to Google...' : 'Continue with Google'}</span>
          </button>

          {/* Secondary Action: Email Sign Up / Sign In */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onEmailLogin('register')}
              className="py-3 px-3 rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/10 text-white font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Mail size={15} className="text-[#66FCF1]" />
              <span>Use Email</span>
            </button>

            <button
              onClick={onGuestAccess}
              className="py-3 px-3 rounded-2xl bg-gradient-to-r from-[#45A29E]/20 to-[#66FCF1]/20 hover:from-[#45A29E]/30 hover:to-[#66FCF1]/30 border border-[#45A29E]/40 text-[#66FCF1] font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Sparkles size={14} className="text-yellow-400" />
              <span>Instant Guest</span>
            </button>
          </div>

          {/* Login prompt for existing members */}
          <div className="pt-2 text-center">
            <button
              onClick={() => onEmailLogin('signin')}
              className="text-xs text-white/60 hover:text-white transition-colors"
            >
              Already have an account? <span className="font-bold text-[#66FCF1] underline underline-offset-2">Sign In</span>
            </button>
          </div>
        </div>

        {/* Small Trust Badge Footnote */}
        <p className="text-[10px] text-center text-white/40 pt-3">
          By continuing, you agree to PTE Ninja&apos;s Terms of Service &amp; Privacy Policy.
        </p>
      </div>
    </div>
  );
};
