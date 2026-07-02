import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, X } from 'lucide-react';

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent');
    if (!consent) {
      // Small delay to not overwhelm the user instantly
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie_consent', 'accepted');
    setIsVisible(false);
    // Here you would initialize analytics scripts if any
  };

  const handleDecline = () => {
    localStorage.setItem('cookie_consent', 'declined');
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed bottom-0 left-0 right-0 z-[999] p-4 sm:p-6 md:px-8 pointer-events-none"
        >
          <div className="max-w-7xl mx-auto flex justify-center md:justify-start pointer-events-auto">
            <div className="bg-app-bg/95 backdrop-blur-xl border border-app-border p-5 rounded-2xl shadow-2xl flex flex-col md:flex-row items-start md:items-center gap-4 max-w-4xl relative">
              <button 
                onClick={() => setIsVisible(false)}
                className="absolute top-3 right-3 p-1 rounded-full hover:bg-app-surface text-app-text-muted transition-colors md:hidden"
              >
                <X size={16} />
              </button>
              
              <div className="p-3 bg-app-primary/10 rounded-xl shrink-0 hidden sm:block">
                <ShieldCheck className="text-app-primary w-6 h-6" />
              </div>
              
              <div className="flex-1 pr-4 md:pr-0">
                <h4 className="text-sm font-bold text-app-text mb-1">We value your privacy</h4>
                <p className="text-xs text-app-text-muted leading-relaxed">
                  We use cookies to enhance your browsing experience and analyze our traffic. 
                  By clicking "Accept All", you consent to our use of cookies in accordance with our 
                  <a href="#" onClick={(e) => { e.preventDefault(); document.getElementById('privacy-policy')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-app-primary hover:underline ml-1">
                    Privacy Policy
                  </a>.
                </p>
              </div>
              
              <div className="flex items-center gap-3 w-full md:w-auto shrink-0 mt-2 md:mt-0">
                <button
                  onClick={handleDecline}
                  className="flex-1 md:flex-none px-4 py-2.5 rounded-xl border border-app-border text-app-text-muted text-xs font-bold hover:bg-app-surface transition-colors uppercase tracking-wider"
                >
                  Decline
                </button>
                <button
                  onClick={handleAccept}
                  className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-app-primary text-app-bg text-xs font-bold hover:bg-app-accent transition-colors uppercase tracking-wider shadow-lg shadow-app-primary/20"
                >
                  Accept All
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
