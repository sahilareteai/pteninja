import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Copy, Check, X, ArrowRight, Gift, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface DiwaliBannerProps {
  variant?: 'banner' | 'card';
  onClaim?: () => void;
  onApply?: () => void;
  onVisibilityChange?: (visible: boolean) => void;
  className?: string;
  dismissible?: boolean;
  isApplied?: boolean;
}

export function DiwaliBanner({
  variant = 'banner',
  onClaim,
  onApply,
  onVisibilityChange,
  className = '',
  dismissible = true,
  isApplied = false,
}: DiwaliBannerProps) {
  const [copied, setCopied] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (variant === 'banner') {
      try {
        const dismissed = sessionStorage.getItem('pte_diwali_banner_dismissed');
        if (dismissed === 'true') {
          setIsDismissed(true);
          onVisibilityChange?.(false);
          return;
        }
      } catch (e) {}
      onVisibilityChange?.(true);
    }
  }, [variant, onVisibilityChange]);

  const handleCopyCode = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await navigator.clipboard.writeText('DIWALI20');
      setCopied(true);
      try {
        localStorage.setItem('pte_pending_referral', 'DIWALI20');
      } catch (err) {}
      toast.success('🪔 Code DIWALI20 copied! Additional 20% Diwali discount pre-applied.', { id: 'diwali-promo-toast' });
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      try {
        localStorage.setItem('pte_pending_referral', 'DIWALI20');
      } catch (e) {}
      toast.success('🪔 Code DIWALI20 activated for additional 20% off!', { id: 'diwali-promo-toast' });
    }
  };

  const handleClaim = () => {
    try {
      localStorage.setItem('pte_pending_referral', 'DIWALI20');
    } catch (e) {}
    if (onApply) {
      onApply();
    } else {
      toast.success('🪔 Additional 20% OFF Diwali voucher activated!', { id: 'diwali-promo-toast' });
      if (onClaim) {
        onClaim();
      }
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDismissed(true);
    onVisibilityChange?.(false);
    try {
      sessionStorage.setItem('pte_diwali_banner_dismissed', 'true');
    } catch (err) {}
  };

  if (isDismissed && variant === 'banner') {
    return null;
  }

  // --- CARD VARIANT (for SubscriptionModal or Dashboard Embed) ---
  if (variant === 'card') {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-950/90 via-orange-950/80 to-amber-950/90 p-3.5 sm:p-5 shadow-[0_0_25px_rgba(245,158,11,0.2)] text-left ${className}`}
      >
        {/* Decorative background glows */}
        <div className="absolute -top-10 -left-10 w-28 h-28 bg-amber-500/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -right-10 w-28 h-28 bg-orange-500/20 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          {/* Diya + Message Header */}
          <div className="flex items-start gap-3 w-full md:w-auto min-w-0">
            {/* Diya Icon: Fixed size, neatly pinned to top-left */}
            <div className="relative shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 flex items-center justify-center shadow-[0_0_12px_rgba(245,158,11,0.45)] mt-0.5">
              <span className="text-xl select-none" role="img" aria-label="Diya lamp">🪔</span>
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-300 rounded-full animate-ping opacity-75" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0">
                  <Sparkles size={10} className="text-amber-300" />
                  Diwali Special
                </span>
                <span className="text-[11px] font-black text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-full shrink-0">
                  Extra 20% OFF
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-extrabold text-white leading-tight">
                Celebrate Diwali with Extra 20% Discount
              </h4>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Use code <span className="font-mono font-bold text-amber-300 bg-amber-900/70 px-1.5 py-0.5 rounded border border-amber-500/30">DIWALI20</span> on all plans
              </p>
            </div>
          </div>

          {/* Action Buttons: Responsive & neatly aligned */}
          <div className="flex items-center gap-2 w-full md:w-auto pt-2 md:pt-0 border-t border-amber-500/20 md:border-0 shrink-0">
            <button
              type="button"
              onClick={handleCopyCode}
              className="flex-1 md:flex-initial px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
              title="Copy DIWALI20 code"
            >
              {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'DIWALI20'}</span>
            </button>

            {isApplied ? (
              <div className="flex-1 md:flex-initial px-3.5 py-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black rounded-xl flex items-center justify-center gap-1.5 shadow-sm">
                <Check size={14} className="text-emerald-400 stroke-[3]" />
                <span>20% OFF Applied</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleClaim}
                className="flex-1 md:flex-initial px-3.5 py-2 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 text-slate-950 text-xs font-black rounded-xl hover:brightness-110 shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <Zap size={13} className="fill-current text-slate-950" />
                <span>Apply 20% OFF</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- BANNER VARIANT (Top of Page / Announcement Bar) ---
  return (
    <AnimatePresence>
      {!isDismissed && (
        <motion.aside
          aria-label="Diwali Special Offer"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={handleClaim}
          className={`relative z-40 w-full overflow-hidden bg-gradient-to-r from-amber-700 via-orange-600 to-amber-700 dark:from-[#5c2306] dark:via-[#7c2d12] dark:to-[#5c2306] text-white border-b border-amber-400/40 shadow-md cursor-pointer select-none ${className}`}
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)',
          }}
        >
          {/* Subtle animated light effect */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-400/20 via-transparent to-transparent pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-2.5 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2 text-xs sm:text-sm">
            {/* Diya + Message */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              <span className="text-base sm:text-lg shrink-0 select-none animate-bounce" role="img" aria-label="Diya lamp">
                🪔
              </span>
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="inline-flex items-center gap-1 bg-amber-300/25 border border-amber-300/40 text-amber-100 text-[10px] font-black uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-full shrink-0">
                  <Sparkles size={10} className="text-amber-200 fill-amber-200" />
                  Diwali Special
                </span>
                <span className="font-extrabold text-amber-100 hidden sm:inline">
                  Get <span className="text-yellow-300 font-black underline decoration-yellow-400 underline-offset-2">Additional 20% OFF</span> all plans with code
                </span>
                <span className="font-extrabold text-amber-100 sm:hidden">
                  <span className="text-yellow-300 font-black">20% OFF</span> code:
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="font-mono font-black text-slate-950 bg-yellow-300 hover:bg-yellow-200 px-1.5 sm:px-2 py-0.5 rounded text-[11px] sm:text-xs shadow-sm transition-all flex items-center gap-1 cursor-pointer active:scale-95 shrink-0"
                  title="Click to copy DIWALI20"
                >
                  <span>DIWALI20</span>
                  {copied ? <Check size={11} className="text-green-800" /> : <Copy size={11} />}
                </button>
              </div>
            </div>

            {/* Actions: Claim Offer is visible and clickable on both mobile and web */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClaim();
                }}
                className="flex items-center gap-1 bg-white text-orange-950 hover:bg-amber-100 font-black text-[11px] sm:text-xs px-2.5 sm:px-3 py-1 rounded-full shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer"
              >
                <span>Claim Offer</span>
                <ArrowRight size={12} className="hidden sm:inline" />
              </button>

              {dismissible && (
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="p-1 text-amber-200 hover:text-white rounded-full hover:bg-white/10 transition-colors shrink-0"
                  aria-label="Dismiss Diwali banner"
                  title="Dismiss banner"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
