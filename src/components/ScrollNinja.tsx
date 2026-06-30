import React from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

export function ScrollNinja() {
  const { scrollYProgress } = useScroll();

  // We map the scroll progress (0 to 1) to different states of the ninja.
  // We'll use a mix of transforms and opacity to simulate drawing a sword and striking.

  // Ninja container moves down as you scroll, but we can just make it fixed or absolute.
  // Actually, making it fixed on the screen is better, but maybe the user wants it to follow the scroll.
  // Let's make it a fixed element on the right side of the screen that animates as you scroll.
  const yPos = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  
  // Right Arm (Swinging sword fast left and right)
  const armRotate = useTransform(
    scrollYProgress, 
    [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1], 
    [0, -120, -45, -135, -30, -150, -45, -135, -30, -150, -45]
  );
  
  // Sword unsheathes quickly at the start, then stays in hand for the swings
  const swordY = useTransform(scrollYProgress, [0, 0.05, 0.1, 1], [0, -30, -50, -50]);
  const swordRotate = useTransform(scrollYProgress, [0, 0.05, 0.1, 1], [0, 45, 90, 90]);
  
  // Karate chop (Left arm) - also punches back and forth
  const leftArmRotate = useTransform(
    scrollYProgress, 
    [0, 0.2, 0.4, 0.6, 0.8, 1], 
    [0, 90, 0, 90, 0, 90]
  );
  
  // Legs (Running/walking pose so they stay clearly visible)
  const leftLegRotate = useTransform(
    scrollYProgress, 
    [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1], 
    [0, 30, -30, 30, -30, 30, -30, 30, -30]
  );
  const rightLegRotate = useTransform(
    scrollYProgress, 
    [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1], 
    [0, -30, 30, -30, 30, -30, 30, -30, 30]
  );
  
  return (
    <div className="fixed right-2 md:right-12 top-1/3 z-50 pointer-events-none scale-75 md:scale-100 origin-right">
      <motion.div 
        style={{ y: yPos }}
        className="relative w-32 h-32"
      >
        {/* Glow effect */}
        <div className="absolute inset-0 bg-app-primary/20 blur-xl rounded-full" />
        
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(69,162,158,0.5)]">
          {/* Head (Ninja mask) */}
          <circle cx="50" cy="30" r="15" fill="currentColor" className="text-slate-800 dark:text-slate-200" />
          <rect x="38" y="22" width="24" height="6" fill="#fff" rx="2" />
          {/* Eyes */}
          <circle cx="45" cy="25" r="1.5" fill="#000" />
          <circle cx="55" cy="25" r="1.5" fill="#000" />
          
          {/* Body */}
          <path d="M 35 45 L 65 45 L 60 80 L 40 80 Z" fill="currentColor" className="text-slate-700 dark:text-slate-300" />
          
          {/* Belt */}
          <rect x="38" y="60" width="24" height="4" fill="var(--color-app-primary, #45A29E)" />
          
          {/* Left Arm (Karate) */}
          <motion.g style={{ rotate: leftArmRotate, originX: '40px', originY: '50px' }}>
            <rect x="25" y="45" width="15" height="6" rx="3" fill="currentColor" className="text-slate-800 dark:text-slate-200" />
          </motion.g>
          
          {/* Right Arm (Sword) */}
          <motion.g style={{ rotate: armRotate, originX: '60px', originY: '50px' }}>
            <rect x="60" y="45" width="25" height="6" rx="3" fill="currentColor" className="text-slate-800 dark:text-slate-200" />
            
            {/* Sword */}
            <motion.g style={{ y: swordY, rotate: swordRotate, originX: '85px', originY: '48px' }}>
              <rect x="80" y="20" width="4" height="30" fill="#cbd5e1" />
              <rect x="75" y="48" width="14" height="4" fill="#475569" />
              <rect x="80" y="52" width="4" height="10" fill="#f59e0b" />
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
