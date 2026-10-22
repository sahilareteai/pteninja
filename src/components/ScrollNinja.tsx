import React, { useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'motion/react';
import { Sparkles, Copy, Check, X, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export function ScrollNinja({ onClaim }: { onClaim?: () => void }) {
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const { scrollYProgress } = useScroll();

  const yPos = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  
  // Continuous smooth running and swinging using sine waves
  const armRotate = useTransform(scrollYProgress, v => Math.sin(v * Math.PI * 20) * -45);
  const leftArmRotate = useTransform(scrollYProgress, v => Math.sin(v * Math.PI * 20) * 45);
  
  const leftLegRotate = useTransform(scrollYProgress, v => Math.sin(v * Math.PI * 20) * 30);
  const rightLegRotate = useTransform(scrollYProgress, v => Math.sin(v * Math.PI * 20) * -30);

  // Switch sword between hands every little bit of scroll
  const rightSwordOpacity = useTransform(scrollYProgress, v => (Math.floor(v * 15) % 2 === 0 ? 1 : 0));
  const leftSwordOpacity = useTransform(scrollYProgress, v => (Math.floor(v * 15) % 2 !== 0 ? 1 : 0));

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText('NINJA10');
      setCopied(true);
      try {
        localStorage.setItem('pte_pending_referral', 'NINJA10');
      } catch (e) {}
      toast.success('Code NINJA10 copied! 10% discount pre-applied.');
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      toast.error('Could not copy code');
    }
  };

  const handleClaim = () => {
    try {
      localStorage.setItem('pte_pending_referral', 'NINJA10');
    } catch (e) {}
    toast.success('10% off code NINJA10 activated for your account!');
    setShowPromoModal(false);
    if (onClaim) {
      onClaim();
    }
  };

  return (
    <>
      <div className="fixed right-2 md:right-12 top-1/3 z-50 pointer-events-none scale-75 md:scale-100 origin-right transform-gpu will-change-transform">
        <motion.div 
          style={{ y: yPos }}
          className="relative w-32 h-32 transform-gpu pointer-events-auto cursor-pointer group select-none"
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowPromoModal(true)}
          role="button"
          tabIndex={0}
          title="Click the Ninja for a secret discount!"
          aria-label="Click the Ninja for a secret discount"
        >
          {/* Floating hint badge */}
          <motion.div
            animate={{ y: [0, -5, 0], scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-[10px] uppercase tracking-wider rounded-full shadow-lg shadow-orange-500/30 flex items-center gap-1 border border-amber-300 pointer-events-none group-hover:scale-110 transition-transform"
          >
            <Sparkles size={11} className="fill-current text-slate-950" />
            <span>10% OFF</span>
          </motion.div>

          <div className="absolute inset-0 bg-app-primary/20 blur-xl rounded-full group-hover:bg-amber-500/30 transition-colors" />
          
          <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible drop-shadow-[0_0_15px_rgba(69,162,158,0.5)] group-hover:drop-shadow-[0_0_20px_rgba(245,158,11,0.7)] transition-all">
            {/* Head */}
            <circle cx="50" cy="30" r="15" fill="currentColor" className="text-slate-800 dark:text-slate-200" />
            <rect x="38" y="22" width="24" height="6" fill="#fff" rx="2" />
            <circle cx="45" cy="25" r="1.5" fill="#000" />
            <circle cx="55" cy="25" r="1.5" fill="#000" />
            
            {/* Body */}
            <path d="M 35 45 L 65 45 L 60 80 L 40 80 Z" fill="currentColor" className="text-slate-700 dark:text-slate-300" />
            
            {/* Belt */}
            <rect x="38" y="60" width="24" height="4" fill="var(--color-app-primary, #45A29E)" />
            
            {/* Left Arm */}
            <motion.g style={{ rotate: leftArmRotate, originX: '40px', originY: '50px' }}>
              <rect x="20" y="45" width="20" height="6" rx="3" fill="currentColor" className="text-slate-800 dark:text-slate-200" />
              <motion.g style={{ opacity: leftSwordOpacity }}>
                <rect x="18" y="15" width="4" height="30" fill="#cbd5e1" />
                <rect x="13" y="45" width="14" height="4" fill="#475569" />
                <rect x="18" y="49" width="4" height="10" fill="#f59e0b" />
              </motion.g>
            </motion.g>
            
            {/* Right Arm */}
            <motion.g style={{ rotate: armRotate, originX: '60px', originY: '50px' }}>
              <rect x="60" y="45" width="20" height="6" rx="3" fill="currentColor" className="text-slate-800 dark:text-slate-200" />
              <motion.g style={{ opacity: rightSwordOpacity }}>
                <rect x="78" y="15" width="4" height="30" fill="#cbd5e1" />
                <rect x="73" y="45" width="14" height="4" fill="#475569" />
                <rect x="78" y="49" width="4" height="10" fill="#f59e0b" />
              </motion.g>
            </motion.g>
            
            {/* Legs */}
            <motion.g style={{ rotate: leftLegRotate, originX: '44px', originY: '80px' }}>
              <rect x="40" y="80" width="8" height="20" rx="2" fill="currentColor" className="text-slate-800 dark:text-slate-200" />
            </motion.g>
            <motion.g style={{ rotate: rightLegRotate, originX: '56px', originY: '80px' }}>
              <rect x="52" y="80" width="8" height="20" rx="2" fill="currentColor" className="text-slate-800 dark:text-slate-200" />
            </motion.g>
          </svg>
        </motion.div>
      </div>

      {/* Secret 10% Off Ninja Modal */}
      <AnimatePresence>
        {showPromoModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPromoModal(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-gradient-to-b from-[#161d28] via-[#0f141d] to-[#0a0d14] border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_60px_rgba(245,158,11,0.25)] text-center overflow-hidden z-10"
            >
              {/* Decorative Glow Elements */}
              <div className="absolute -top-24 -left-24 w-52 h-52 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-52 h-52 bg-app-primary/20 rounded-full blur-3xl pointer-events-none" />

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setShowPromoModal(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>

              {/* Ninja Mascot in Modal */}
              <div className="relative mx-auto w-24 h-24 mb-4">
                <div className="absolute inset-0 bg-amber-500/30 blur-2xl rounded-full animate-pulse" />
                <div className="relative w-full h-full flex items-center justify-center bg-slate-900/90 border-2 border-amber-500/50 rounded-2xl shadow-inner overflow-hidden">
                  <svg viewBox="0 0 100 100" className="w-16 h-16 overflow-visible">
                    <circle cx="50" cy="35" r="16" fill="#1e293b" />
                    <rect x="37" y="27" width="26" height="7" fill="#fff" rx="2" />
                    <circle cx="45" cy="30" r="1.8" fill="#000" />
                    <circle cx="55" cy="30" r="1.8" fill="#000" />
                    <path d="M 33 52 L 67 52 L 62 85 L 38 85 Z" fill="#0f172a" />
                    <rect x="36" y="66" width="28" height="5" fill="#f59e0b" />
                    <rect x="18" y="52" width="16" height="6" rx="3" fill="#1e293b" />
                    <rect x="66" y="52" width="16" height="6" rx="3" fill="#1e293b" />
                    <rect x="78" y="24" width="4" height="30" fill="#cbd5e1" />
                    <rect x="74" y="54" width="12" height="4" fill="#475569" />
                    <rect x="78" y="58" width="4" height="10" fill="#f59e0b" />
                  </svg>
                </div>
                <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full shadow-md uppercase tracking-wider">
                  SECRET
                </div>
              </div>

              {/* Header Texts */}
              <div className="space-y-2 mb-6">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider">
                  <Sparkles size={13} className="text-amber-400" />
                  <span>Secret Ninja Unlocked!</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  You Found 10% Off!
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
                  A true PTE Ninja spots every advantage. Use this secret code to get an extra 10% discount on any plan.
                </p>
              </div>

              {/* Coupon Box */}
              <div className="relative bg-slate-950/90 border-2 border-dashed border-amber-500/50 rounded-2xl p-4 mb-5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
                <div className="text-center sm:text-left">
                  <div className="text-[10px] uppercase font-bold text-amber-400/80 tracking-widest mb-0.5">
                    Exclusive Promo Code
                  </div>
                  <div className="font-mono text-2xl font-black tracking-widest text-amber-400 selection:bg-amber-500/30">
                    NINJA10
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-orange-500/20 flex items-center justify-center gap-1.5 shrink-0"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleClaim}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-app-primary to-app-accent text-slate-950 font-black text-sm uppercase tracking-wider rounded-xl hover:brightness-110 transition-all shadow-lg shadow-app-primary/25 flex items-center justify-center gap-2"
                >
                  <span>Claim & Start Practice</span>
                  <ArrowRight size={16} />
                </button>
                <p className="text-[11px] text-slate-400">
                  Code will automatically be saved and pre-applied at checkout.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

