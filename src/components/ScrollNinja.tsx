import React from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

export function ScrollNinja() {
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
  
  return (
    <div className="fixed right-2 md:right-12 top-1/3 z-50 pointer-events-none scale-75 md:scale-100 origin-right">
      <motion.div 
        style={{ y: yPos }}
        className="relative w-32 h-32"
      >
        <div className="absolute inset-0 bg-app-primary/20 blur-xl rounded-full" />
        
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible drop-shadow-[0_0_15px_rgba(69,162,158,0.5)]">
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
  );
}
